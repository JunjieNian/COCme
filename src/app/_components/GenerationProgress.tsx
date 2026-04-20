'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Progress bar + phase label for long-running server actions that we can't
 * stream real progress from (the DeepSeek reasoner gives us one big JSON
 * response, no interim signal).
 *
 * Strategy: pure time-based estimate with an asymptotic curve — progress
 * crosses 90% near the expected finish time and then stalls there so the
 * user doesn't see a "100% but still waiting" bar.  Phase label changes at
 * time thresholds, giving the user a sense of what's happening.
 *
 * Accepts the form state via `useFormStatus()`, so just drop it inside a
 * `<form action={serverAction}>` like `<LongTaskButton>`.
 */

export interface ProgressPhase {
  /** Seconds at which this phase becomes the current label. */
  from: number;
  label: string;
}

const DEFAULT_PHASES: ProgressPhase[] = [
  { from: 0,  label: '提交请求，连接 DeepSeek' },
  { from: 3,  label: 'reasoner 思考中' },
  { from: 18, label: '生成模组结构（前提 / 场景 / NPC）' },
  { from: 45, label: '编织线索与真相图' },
  { from: 75, label: '整理结局条件与遭遇' },
  { from: 120, label: '快好了，再等一会儿' },
];

/**
 * Asymptotic progress curve.  `expectedSec` is "where we target 90%".  Result
 * is clamped to [0, 0.95] so the bar never hits 100% until the action
 * actually resolves (at which point the form navigates away anyway).
 */
function asymptoticPct(elapsedSec: number, expectedSec: number): number {
  // f(t) = 0.9 * (1 - exp(-t / τ)), τ chosen so f(expected)=0.9
  // ln(0.1) / -1 = 2.30; τ = expectedSec / 2.30
  const tau = expectedSec / 2.3;
  const raw = 0.9 * (1 - Math.exp(-elapsedSec / tau));
  return Math.min(0.95, raw);
}

export function GenerationProgress({
  label = '生成中',
  expectedSec = 60,
  phases = DEFAULT_PHASES,
  submitButton,
}: {
  /** Top-line title when pending. */
  label?: string;
  /** Seconds at which progress should visually reach ~90%.  Beyond this the bar asymptotes. */
  expectedSec?: number;
  /** Phase labels by elapsed-seconds thresholds; must be sorted ascending by `from`. */
  phases?: ProgressPhase[];
  /** The submit button to show when idle.  Must be a <button type="submit">. */
  submitButton: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - started) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [pending]);

  if (!pending) return <>{submitButton}</>;

  const pct = asymptoticPct(elapsed, expectedSec);
  const phase = [...phases].reverse().find(p => elapsed >= p.from) ?? phases[0]!;

  return (
    <div className="rounded border border-rust-600/40 bg-rust-700/5 p-4">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-serif text-ink-100">{label}</span>
        <span className="font-mono text-xs text-ink-400">{Math.floor(elapsed)}s</span>
      </div>
      <div className="mb-2 h-2 w-full overflow-hidden rounded bg-ink-800">
        <div
          className="h-full bg-gradient-to-r from-rust-700 to-rust-500 transition-[width] duration-200 ease-out"
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rust-500" />
        <span>{phase.label}…</span>
      </div>
      <p className="mt-3 text-[11px] text-ink-500">
        DeepSeek 的 reasoner 一次性给完整 JSON，不走 token 流，所以这条进度条是时间近似——实际完成时直接跳转到模组页面。期间请不要关页面或重复提交。
      </p>
    </div>
  );
}
