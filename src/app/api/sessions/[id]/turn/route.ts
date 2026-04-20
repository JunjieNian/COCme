import type { NextRequest } from 'next/server';
import { LocalSessionRepo } from '@/db/local';
import {
  executeTurnAndCommit,
  type KpCaller,
} from '@/engine';
import { cryptoRng } from '@/rules';
import { createDeepSeek, streamCallKp } from '@/ai';
import { requireSessionOwner } from '@/lib/auth';
import { resolveDeepSeekApiKey } from '@/lib/deepseek-resolver';
import { withSessionLock } from '@/lib/session-lock';
import { LocalDB } from '@/lib/localdb/db';
import { triggerVisualsFromDelta } from '@/visual/trigger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/sessions/[id]/turn
// Body: { player_input: string | null }
// Response: text/event-stream
//   event: narration    data: { text }          (cumulative text so far)
//   event: complete     data: <PlayerView>      (final view after commit)
//   event: error        data: { message }       (terminal error)
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  let userId: string;
  try {
    const user = await requireSessionOwner(sessionId);
    userId = user.id;
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 403 });
  }

  let playerInput: string | null = null;
  try {
    const body = (await req.json()) as { player_input?: string | null };
    playerInput = body.player_input ?? null;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = await resolveDeepSeekApiKey(userId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const ds = createDeepSeek({ apiKey });
  const repo = new LocalSessionRepo();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      const kp: KpCaller = async (ctx: unknown) => {
        return streamCallKp(
          ctx,
          { client: ds.client, model: ds.chatModel },
          { onNarrationChange: text => send('narration', { text }) },
        );
      };

      try {
        const result = await withSessionLock(sessionId, () => executeTurnAndCommit(
          repo,
          sessionId,
          { player_input: playerInput },
          {
            rng: cryptoRng,
            callKp: kp,
            onCheckResolved: resolution => {
              // Flush the dice result to the client *before* the KP starts
              // generating, so the physical dice animation plays while the
              // model is thinking.
              const payload: {
                summary: string;
                outcome: typeof resolution.outcome;
                kind: typeof resolution.kind;
                roll: number;
                target: number | null;
              } =
                resolution.kind === 'san' && resolution.san_result
                  ? {
                      summary: resolution.summary,
                      outcome: resolution.outcome,
                      kind: 'san',
                      roll: resolution.san_result.d100,
                      target: resolution.san_result.current_san,
                    }
                  : resolution.kind === 'skill_like' && resolution.skill_result
                    ? {
                        summary: resolution.summary,
                        outcome: resolution.outcome,
                        kind: 'skill_like',
                        roll: resolution.skill_result.roll.chosen,
                        target: resolution.skill_result.target,
                      }
                    : {
                        summary: resolution.summary,
                        outcome: resolution.outcome,
                        kind: resolution.kind,
                        roll: 0,
                        target: null,
                      };
              send('check_resolved', payload);
            },
          },
        ));

        // Post-commit: enqueue visual-evidence jobs for newly-revealed clues.
        // Errors here must never break the turn, so catch and log only.
        try {
          const db = await LocalDB.get();
          const session = db.sessions.find(s => s.id === sessionId);
          const user = db.users.find(u => u.id === userId);
          if (session && user) {
            await triggerVisualsFromDelta({
              userId,
              sessionId,
              moduleId: session.module_id,
              moduleContent: result.state.module,
              ...(user.visual_settings !== undefined ? { settings: user.visual_settings } : { settings: undefined }),
              delta: result.delta,
            });
          }
        } catch (err) {
          console.error('[visual.trigger] failed:', err);
        }

        send('complete', result.view);
      } catch (err) {
        send('error', { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
