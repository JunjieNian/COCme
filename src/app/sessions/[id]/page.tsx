import { notFound } from 'next/navigation';
import { LocalSessionRepo } from '@/db/local';
import { buildResumeView } from '@/engine';
import { GameView } from './GameView';
import { requireSessionOwner } from '@/lib/auth';
import { getUserVisualSettings } from '@/lib/localdb/users';
import { backfillCurrentSceneVisual } from '@/visual/trigger';

export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;

  let userId: string;
  try {
    const u = await requireSessionOwner(sessionId);
    userId = u.id;
  } catch {
    notFound();
  }

  const repo = new LocalSessionRepo();
  const state = await repo.loadSession(sessionId);
  const initialView = buildResumeView(state);

  // Best-effort opening / current-scene establishing shot.  Cheap no-op if
  // visuals are disabled, the scene already has an asset, or the per-session
  // cap is hit.  Errors here must never break the page.
  try {
    const settings = await getUserVisualSettings(userId);
    const lastKp = [...state.turns].reverse().find(t => t.actor === 'kp');
    await backfillCurrentSceneVisual({
      userId,
      sessionId,
      moduleId: state.module_id,
      moduleContent: state.module,
      currentSceneId: state.current_scene_id,
      lastKpTurnId: lastKp?.id ?? null,
      settings,
    });
  } catch (err) {
    console.error('[visual.backfill] failed:', err);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl">
          {state.investigator.base.name}
          <span className="ml-3 text-sm text-ink-400">
            {state.module.meta.title}
          </span>
        </h1>
        <span className="text-xs text-ink-400">session {sessionId.slice(0, 8)}…</span>
      </div>
      <GameView sessionId={sessionId} initialView={initialView} />
    </section>
  );
}
