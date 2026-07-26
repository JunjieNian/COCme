import { describe, it, expect, vi } from 'vitest';
import { streamCallKp } from './stream.js';
import type { ChatCompletion } from './provider.js';

/**
 * Tests for the transient-error retry behaviour on the streaming KP path.
 *
 * We stub the provider-level ChatCompletion so no Codex process is started.
 */

function validKpOutputJson(): string {
  return JSON.stringify({
    scene_id: 'scene_1',
    visible_narration: 'hello world',
    player_options: [],
    required_check: null,
    state_ops: [],
    hidden_notes: [],
  });
}

describe('streamCallKp transient-error retry', () => {
  it('retries after a connection-class failure and succeeds', async () => {
    const payload = validKpOutputJson();

    let attempt = 0;
    const chat: ChatCompletion = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error('connection reset') as Error & { code?: string };
        err.code = 'ECONNRESET';
        throw err;
      }
      return { content: payload };
    });

    const narrations: string[] = [];
    const result = await streamCallKp(
      { ctx: 'demo' },
      { chat, model: 'test-model' },
      { onNarrationChange: t => narrations.push(t) },
    );

    expect(result.visible_narration).toBe('hello world');
    expect(attempt).toBe(2);
    // onRetry should have emitted at least one clearing pulse ('') before the
    // second attempt returned the real narration.
    expect(narrations.some(n => n === '')).toBe(true);
    // Final narration state should be the full text.
    expect(narrations[narrations.length - 1]).toBe('hello world');
  }, 10_000);

  it('does not retry on a 401-class (non-retryable) error', async () => {
    const chat: ChatCompletion = vi.fn().mockImplementation(async () => {
      const err = new Error('unauthorized') as Error & { status?: number };
      err.status = 401;
      throw err;
    });

    await expect(
      streamCallKp({ ctx: 'demo' }, { chat, model: 'test-model' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(chat).toHaveBeenCalledTimes(1);
  });
});
