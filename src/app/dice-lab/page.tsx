'use client';

import { useState } from 'react';
import { DiceRoll, type DiceOutcome } from '@/app/_components/DiceRoll';

/**
 * Standalone dice-animation playground.  Not tied to any session or auth —
 * anyone with the URL can poke it.  Useful for tuning the roll feel without
 * starting a real game.
 */
export default function DiceLabPage() {
  const [outcome, setOutcome] = useState<DiceOutcome>('regular_success');
  const [value, setValue] = useState(42);
  const [target, setTarget] = useState<number | null>(60);
  const [rollNo, setRollNo] = useState(0);

  function fire(o: DiceOutcome, v: number, t: number | null) {
    setOutcome(o);
    setValue(v);
    setTarget(t);
    setRollNo(n => n + 1);
  }

  function deriveOutcome(v: number, t: number): DiceOutcome {
    if (v === 1) return 'critical';
    if (t < 50 ? v >= 96 : v === 100) return 'fumble';
    if (v <= Math.floor(t / 5)) return 'extreme_success';
    if (v <= Math.floor(t / 2)) return 'hard_success';
    if (v <= t) return 'regular_success';
    return 'fail';
  }

  function randomRoll() {
    const v = Math.floor(Math.random() * 100) + 1;
    const t = 60;
    fire(deriveOutcome(v, t), v, t);
  }

  function customSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = Math.max(1, Math.min(100, Number(fd.get('v') ?? 50)));
    const t = Math.max(1, Math.min(99, Number(fd.get('t') ?? 60)));
    fire(deriveOutcome(v, t), v, t);
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-2xl">骰子测试台</h1>
        <p className="mt-1 text-sm text-ink-400">
          反复点按钮能反复看到滚动。不影响任何游戏数据；也不需要登录。
        </p>
      </header>

      {/* 主展示区 */}
      <div className="rounded border border-ink-700 bg-ink-900 p-6">
        <DiceRoll
          finalValue={value}
          target={target}
          outcome={outcome}
          triggerKey={rollNo}
          label={`rollNo=${rollNo} · 目标=${target} · 骰点=${value} · outcome=${outcome}`}
        />
      </div>

      {/* 快速触发各 outcome */}
      <div>
        <h2 className="mb-2 font-serif text-lg">指定 outcome</h2>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <Btn onClick={() => fire('critical', 1, 60)} accent="amber">
            大成功 · 01
          </Btn>
          <Btn onClick={() => fire('extreme_success', 10, 60)} accent="amber">
            极限成功
          </Btn>
          <Btn onClick={() => fire('hard_success', 25, 60)} accent="emerald">
            困难成功
          </Btn>
          <Btn onClick={() => fire('regular_success', 48, 60)} accent="ink">
            常规成功
          </Btn>
          <Btn onClick={() => fire('fail', 78, 60)} accent="rust-light">
            失败
          </Btn>
          <Btn onClick={() => fire('fumble', 99, 60)} accent="rust">
            大失败 · 96+
          </Btn>
          <Btn onClick={() => fire('san_passed', 18, 55)} accent="ink">
            SAN 通过
          </Btn>
          <Btn onClick={() => fire('san_failed', 72, 55)} accent="rust-light">
            SAN 失败
          </Btn>
        </div>
      </div>

      {/* 随机 + 自定义 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-serif text-lg">随机</h2>
          <Btn onClick={randomRoll} accent="rust">
            随机一次（目标 60）
          </Btn>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-lg">自定义</h2>
          <form onSubmit={customSubmit} className="flex items-end gap-2 text-sm">
            <label className="flex flex-col">
              <span className="mb-1 text-xs text-ink-400">骰点 1-100</span>
              <input
                name="v"
                type="number"
                min={1}
                max={100}
                defaultValue={50}
                className="w-20 rounded border border-ink-700 bg-ink-900 px-2 py-1"
              />
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-xs text-ink-400">目标 1-99</span>
              <input
                name="t"
                type="number"
                min={1}
                max={99}
                defaultValue={60}
                className="w-20 rounded border border-ink-700 bg-ink-900 px-2 py-1"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-rust-600 bg-rust-700/60 px-3 py-1.5 hover:bg-rust-600"
            >
              掷
            </button>
          </form>
          <p className="mt-1 text-xs text-ink-500">
            outcome 会按 CoC 7e 自动推断（≤ 目标/5 极限、≤ 目标/2 困难、≤ 目标 常规；01 暴击；低于 50 目标 96+ 大失败）。
          </p>
        </div>
      </div>

      {/* 色板速查 */}
      <details className="rounded border border-ink-800 bg-ink-950 p-4 text-sm">
        <summary className="cursor-pointer font-serif text-ink-200">Outcome 色板说明</summary>
        <ul className="mt-3 space-y-1 text-xs text-ink-300">
          <li>
            <span className="font-serif text-amber-300">金</span> — 暴击 / 极限成功
          </li>
          <li>
            <span className="font-serif text-emerald-300">绿</span> — 困难成功
          </li>
          <li>
            <span className="font-serif text-ink-100">灰白</span> — 常规成功 / SAN 通过
          </li>
          <li>
            <span className="font-serif text-rust-400">锈浅</span> — 普通失败 / SAN 失败
          </li>
          <li>
            <span className="font-serif text-rust-500">锈深</span> — 大失败（fumble）
          </li>
        </ul>
      </details>
    </section>
  );
}

function Btn({
  children,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent: 'amber' | 'emerald' | 'ink' | 'rust-light' | 'rust';
}) {
  const cls: Record<typeof accent, string> = {
    amber: 'border-amber-500/50 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10',
    emerald: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-200 hover:bg-emerald-500/10',
    ink: 'border-ink-600 bg-ink-900 text-ink-200 hover:border-ink-400',
    'rust-light': 'border-rust-500/50 bg-rust-500/5 text-rust-300 hover:bg-rust-500/10',
    rust: 'border-rust-600/60 bg-rust-700/20 text-rust-200 hover:bg-rust-700/30',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-3 py-1.5 font-serif transition ${cls[accent]}`}
    >
      {children}
    </button>
  );
}
