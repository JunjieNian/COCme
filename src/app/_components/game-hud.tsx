'use client';

import type { PlayerView } from '@/engine/projection';

// ---------------------------------------------------------------------------
// Shared game-UI pieces used by both /sessions/[id]/GameView and /demo/DemoGame.
// No internal state; pure presentation + callbacks.
// ---------------------------------------------------------------------------

export function HudBar({ view }: { view: PlayerView }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center text-sm">
      <Stat label="HP" cur={view.hud.hp.current} max={view.hud.hp.max} />
      <Stat label="MP" cur={view.hud.mp.current} max={view.hud.mp.max} />
      <Stat label="SAN" cur={view.hud.san.current} max={view.hud.san.max} />
      <Stat label="Luck" cur={view.hud.luck} max={99} />
      {view.hud.conditions.length > 0 && (
        <div className="col-span-4 text-xs text-rust-500">
          状态：{view.hud.conditions.join(', ')}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, cur, max }: { label: string; cur: number; max: number }) {
  const ratio = max > 0 ? cur / max : 0;
  const color = ratio > 0.5 ? 'bg-ink-600' : ratio > 0.2 ? 'bg-rust-700' : 'bg-rust-500';
  return (
    <div className="rounded border border-ink-700 bg-ink-900 px-2 py-1">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-serif text-lg">
        {cur}
        <span className="text-ink-500"> / {max}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-ink-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * A check-prompt panel.  Pass `onPush` only if pushing should be offered;
 * pass `pushDisabled` to grey the button while an in-flight request is running.
 */
export function CheckPrompt({
  view,
  onPush,
  pushDisabled = false,
}: {
  view: PlayerView;
  onPush?: () => void;
  pushDisabled?: boolean;
}) {
  const c = view.pending_check;
  if (!c) return null;
  const skill = c.skill_or_stat ?? c.kind;
  const bonuses = [
    c.bonus_dice > 0 ? `+${c.bonus_dice} 奖励骰` : null,
    c.penalty_dice > 0 ? `${c.penalty_dice} 惩罚骰` : null,
  ]
    .filter(Boolean)
    .join('，');
  // Difficulty target math (skill or stat): commit / hard / extreme.
  // We don't know the exact target value in the view (it's not in pending_check),
  // so just label the tier.
  const diffLabel = c.difficulty === 'regular' ? '常规' : c.difficulty === 'hard' ? '困难' : '极限';

  return (
    <div className="rounded-md border-2 border-rust-600/60 bg-rust-700/15 p-4 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-rust-300">
            下一个行动将触发检定
          </div>
          <div className="mt-0.5 font-serif text-xl text-ink-50">
            {skill}
            <span className="ml-2 rounded border border-rust-500/60 px-2 py-0.5 align-middle text-xs font-normal text-rust-200">
              {diffLabel}
            </span>
          </div>
        </div>
        {bonuses && (
          <div className="text-xs text-ink-300">{bonuses}</div>
        )}
      </div>
      {c.note && <p className="mt-2 text-ink-300">{c.note}</p>}
      <p className="mt-2 text-xs text-ink-400">
        选项或输入框提交后立即掷骰；
        {onPush && (
          <>
            也可以
            <button
              type="button"
              disabled={pushDisabled}
              onClick={onPush}
              className="ml-1 underline hover:text-rust-500 disabled:opacity-50"
            >
              推动上一次失败的检定
            </button>
            。
          </>
        )}
      </p>
    </div>
  );
}

export function History({ history }: { history: PlayerView[] }) {
  const slice = history.slice(-6).reverse();
  if (slice.length === 0) return null;
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-4 text-sm">
      <h3 className="mb-2 font-serif text-lg">近 {slice.length} 回合</h3>
      <ol className="space-y-2 text-xs text-ink-300">
        {slice.map((v, i) => (
          <li key={history.length - i - 1} className="border-l border-ink-700 pl-2">
            <div className="text-ink-400">
              #{v.turn_index} · {v.scene_id}
            </div>
            <div className="line-clamp-2">{v.narration}</div>
            {v.resolved_check && (
              <div className="text-rust-500">[检定] {v.resolved_check.summary}</div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
