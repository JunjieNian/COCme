import { zodToJsonSchema } from 'zod-to-json-schema';
import { KpOutput } from '../schemas/kp-output.js';
import type { KpOutput as KpOutputT } from '../schemas/kp-output.js';
import { KP_SYSTEM_PROMPT } from './prompt.js';
import type { ChatCompletion, ChatMessage } from './provider.js';
import { withApiRetry } from '../lib/retry.js';

// Codex SDK streams completed agent items rather than JSON token deltas. The
// browser still uses SSE, but narration is emitted once the structured result
// is complete. Dice/check events continue to arrive before the Codex call.

export interface StreamKpDeps {
  chat: ChatCompletion;
  model: string;
}

export interface StreamKpCallbacks {
  /** Called with the complete narration once Codex returns valid JSON. */
  onNarrationChange?: (text: string) => void;
}

export interface StreamKpOptions {
  systemPrompt?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** Override the repair-retry budget. Default 1. */
  maxRepairAttempts?: number;
}

/** The legitimate StateOp discriminator values. Keep in sync with
 * src/schemas/state-op.ts. */
const KNOWN_OPS: ReadonlySet<string> = new Set([
  'advance_clock',
  'change_scene',
  'hp_change',
  'mp_change',
  'san_change',
  'luck_change',
  'damage_roll',
  'san_check',
  'add_inventory',
  'remove_inventory',
  'reveal_clue',
  'npc_disposition',
  'npc_dead',
  'flag_set',
]);

export async function streamCallKp(
  context: unknown,
  deps: StreamKpDeps,
  callbacks: StreamKpCallbacks = {},
  opts: StreamKpOptions = {},
): Promise<KpOutputT> {
  const system = opts.systemPrompt ?? KP_SYSTEM_PROMPT;
  const maxRepairs = opts.maxRepairAttempts ?? 1;
  const userContent = typeof context === 'string' ? context : JSON.stringify(context);
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
  const outputSchema = zodToJsonSchema(KpOutput, { target: 'openAi' });

  const call = (messages: ChatMessage[]) => withApiRetry(
    () => deps.chat({
      model: deps.model,
      messages,
      response_format: { type: 'json_object' },
      output_schema: outputSchema,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    }),
    {
      retries: 3,
      delays: [500, 1500, 4000],
      onRetry: () => callbacks.onNarrationChange?.(''),
      ...(opts.signal ? { signal: opts.signal } : {}),
    },
  );

  const first = await call(baseMessages);
  let previousOutput = first.content ?? '';
  let lastError: unknown = previousOutput ? null : new Error('empty content');

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    if (previousOutput) {
      const parsed = tryParseJson(previousOutput);
      if (parsed !== null) {
        const scrubbed = scrubUnknownOps(parsed, attempt === 0 ? 'codex' : 'repair');
        const result = KpOutput.safeParse(scrubbed.value);
        if (result.success) {
          callbacks.onNarrationChange?.(result.data.visible_narration);
          return result.data;
        }
        lastError = result.error;
      } else {
        lastError = new Error('JSON parse failed');
      }
    }

    if (attempt === maxRepairs) break;

    const repair = await call([
      ...baseMessages,
      { role: 'assistant', content: previousOutput },
      {
        role: 'user',
        content:
          `The previous output did not match the schema. Error: ${errorText(lastError)}.\n` +
          `Valid state_ops.op values are: ${[...KNOWN_OPS].join(', ')}.\n` +
          'Return one corrected JSON object only, with no Markdown or explanation.',
      },
    ]);
    previousOutput = repair.content ?? '';
  }

  throw new Error(`streamCallKp: schema mismatch after repair: ${errorText(lastError)}`);
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  if (!err) return 'unknown';
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Drop state_ops[] entries whose `op` is unknown, so one hallucinated
 * operation does not discard an otherwise usable turn.
 */
function scrubUnknownOps(root: unknown, tag: string): { value: unknown; dropped: number } {
  if (!root || typeof root !== 'object') return { value: root, dropped: 0 };
  const obj = root as { state_ops?: unknown };
  if (!Array.isArray(obj.state_ops)) return { value: root, dropped: 0 };
  const raw = obj.state_ops as Array<{ op?: unknown }>;
  const kept: unknown[] = [];
  const dropped: Array<{ op: unknown; reason: string }> = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof entry.op === 'string' && KNOWN_OPS.has(entry.op)) {
      kept.push(entry);
    } else {
      dropped.push({ op: entry?.op, reason: 'unknown op' });
    }
  }
  if (dropped.length > 0) {
    console.warn(`[KP:${tag}] dropped ${dropped.length} unknown state_ops:`, dropped.map(d => d.op));
  }
  return { value: { ...obj, state_ops: kept }, dropped: dropped.length };
}
