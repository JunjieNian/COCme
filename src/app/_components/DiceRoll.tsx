'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated d100 roll as two dice *cards* (十位 / 个位).
 *
 * Intentionally NOT 3D — we tried polyhedron geometries in CSS 3D and they
 * kept hitting the same issues (backface bleeding, z-fighting, star-spike
 * silhouettes, digit decals floating off the face), so we're settling on
 * card-style: two squares side-by-side with rapid number cycling, a subtle
 * shake during the roll, and outcome-colored border + glow on settle.
 *
 * If you ever want a real 3D dice later, pull in @3d-dice/dice-box or three.js
 * — CSS 3D alone isn't the right tool.
 */
export type DiceOutcome =
  | 'critical'
  | 'extreme_success'
  | 'hard_success'
  | 'regular_success'
  | 'fail'
  | 'fumble'
  | 'san_passed'
  | 'san_failed';

interface DiceRollProps {
  finalValue: number;
  triggerKey: string | number;
  outcome: DiceOutcome;
  target?: number | null;
  label?: string;
}

const ROLL_MS = 1400;
const CYCLE_MS = 60;

export function DiceRoll({ finalValue, triggerKey, outcome, target, label }: DiceRollProps) {
  const [displayed, setDisplayed] = useState(finalValue);
  const [rolling, setRolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplayed(finalValue);
      setRolling(false);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);

    setRolling(true);
    intervalRef.current = setInterval(() => {
      setDisplayed(Math.floor(Math.random() * 100) + 1);
    }, CYCLE_MS);

    settleTimerRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setDisplayed(finalValue);
      setRolling(false);
    }, ROLL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const tens = Math.floor(displayed / 10);
  const units = displayed % 10;

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      {label && (
        <div className="max-w-md text-center text-xs text-ink-400">{label}</div>
      )}

      <div className="flex items-end justify-center gap-4">
        <Card digit={tens} label="十位" rolling={rolling} outcome={rolling ? null : outcome} />
        <Card digit={units} label="个位" rolling={rolling} outcome={rolling ? null : outcome} />
      </div>

      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-xs text-ink-400">掷出</span>
        <span className={`font-serif text-4xl transition-colors ${outcomeNumberColor(outcome, rolling)}`}>
          {displayed}
        </span>
        {target !== null && target !== undefined && (
          <span className="text-xs text-ink-400">目标 {target}</span>
        )}
      </div>

      {!rolling && <OutcomeBadge outcome={outcome} />}
    </div>
  );
}

function Card({
  digit,
  label,
  rolling,
  outcome,
}: {
  digit: number;
  label: string;
  rolling: boolean;
  outcome: DiceOutcome | null;
}) {
  const accent = outcome ? outcomeAccent(outcome) : { border: 'border-ink-500', glow: undefined };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          'flex h-20 w-16 items-center justify-center rounded-md border-2',
          'bg-gradient-to-br from-ink-700 to-ink-900',
          'font-serif text-4xl text-ink-50',
          'shadow-[inset_0_2px_4px_rgba(255,255,255,0.06),0_6px_10px_rgba(0,0,0,0.55)]',
          'transition-[border-color,box-shadow] duration-300',
          accent.border,
          rolling ? 'animate-die-shake' : '',
        ].join(' ')}
        style={outcome && accent.glow ? { boxShadow: `0 0 12px ${accent.glow}, inset 0 2px 4px rgba(255,255,255,0.06)` } : undefined}
      >
        {digit}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-ink-500">{label}</div>
    </div>
  );
}

function outcomeNumberColor(o: DiceOutcome, rolling: boolean): string {
  if (rolling) return 'text-ink-100';
  switch (o) {
    case 'critical':
    case 'extreme_success': return 'text-amber-300';
    case 'hard_success':    return 'text-emerald-300';
    case 'regular_success':
    case 'san_passed':      return 'text-ink-100';
    case 'fumble':          return 'text-rust-500';
    case 'fail':
    case 'san_failed':
    default:                return 'text-rust-400';
  }
}

function outcomeAccent(o: DiceOutcome): { border: string; glow: string | undefined } {
  switch (o) {
    case 'critical':
    case 'extreme_success': return { border: 'border-amber-400',  glow: 'rgba(252,211,77,0.55)' };
    case 'hard_success':    return { border: 'border-emerald-400', glow: 'rgba(110,231,183,0.45)' };
    case 'regular_success':
    case 'san_passed':      return { border: 'border-ink-400',    glow: undefined };
    case 'fumble':          return { border: 'border-rust-500',   glow: 'rgba(168,74,45,0.65)' };
    case 'fail':
    case 'san_failed':
    default:                return { border: 'border-rust-400',   glow: 'rgba(199,131,111,0.45)' };
  }
}

function OutcomeBadge({ outcome }: { outcome: DiceOutcome }) {
  const { label, cls } = outcomeMeta(outcome);
  return (
    <span className={`rounded border px-3 py-1 text-sm font-serif ${cls}`}>{label}</span>
  );
}

function outcomeMeta(o: DiceOutcome): { label: string; cls: string } {
  switch (o) {
    case 'critical':          return { label: '大成功 · 01',          cls: 'border-amber-400/60 bg-amber-400/10 text-amber-200' };
    case 'extreme_success':   return { label: '极限成功',              cls: 'border-amber-500/60 bg-amber-500/10 text-amber-200' };
    case 'hard_success':      return { label: '困难成功',              cls: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' };
    case 'regular_success':   return { label: '常规成功',              cls: 'border-ink-500 bg-ink-700/40 text-ink-100' };
    case 'fail':              return { label: '失败',                  cls: 'border-rust-500/60 bg-rust-500/10 text-rust-300' };
    case 'fumble':            return { label: '大失败 · 96+',          cls: 'border-rust-700 bg-rust-700/30 text-rust-200' };
    case 'san_passed':        return { label: 'SAN 检定通过',          cls: 'border-ink-500 bg-ink-700/40 text-ink-100' };
    case 'san_failed':        return { label: 'SAN 检定失败',          cls: 'border-rust-500/60 bg-rust-500/10 text-rust-300' };
  }
}
