import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';
import type { SessionRow } from '@/db/types';

export const dynamic = 'force-dynamic';

type StatusKey = SessionRow['status'];

export default async function SessionsPage() {
  const user = await requireUser();
  const db = await LocalDB.get();

  // Enrich sessions with investigator + module titles for display.
  const mine = db.sessions
    .filter(s => s.owner_id === user.id)
    .map(s => {
      const inv = db.investigators.find(i => i.id === s.investigator_id);
      const mod = db.modules.find(m => m.id === s.module_id);
      const turnCount = db.turns.filter(t => t.session_id === s.id).length;
      return {
        session: s,
        investigator_name: inv?.name ?? '（人物卡已删）',
        module_title: mod?.title ?? '（模组已删）',
        turn_count: turnCount,
      };
    })
    // Active first, then by updated_at desc.
    .sort((a, b) => {
      const aActive = a.session.status === 'active' ? 0 : 1;
      const bActive = b.session.status === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.session.updated_at.localeCompare(a.session.updated_at);
    });

  const active = mine.filter(x => x.session.status === 'active');
  const past = mine.filter(x => x.session.status !== 'active');

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">跑团存档</h1>
          <p className="mt-1 text-sm text-ink-400">
            所有你参与过的局。进行中的可以继续，已结束的可以看复盘和应用成长。
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="rounded border border-rust-600 bg-rust-700/50 px-4 py-2 text-sm hover:bg-rust-600"
        >
          + 新开一局
        </Link>
      </div>

      {mine.length === 0 ? (
        <div className="rounded border border-ink-700 bg-ink-900 p-6 text-sm text-ink-300">
          <p>还没开过局。</p>
          <p className="mt-2 text-xs text-ink-500">
            先去 <Link href="/investigators/new" className="underline hover:text-rust-500">建一张人物卡</Link>
            ，然后 <Link href="/modules/new" className="underline hover:text-rust-500">生成一个模组</Link>
            ，就可以 <Link href="/sessions/new" className="underline hover:text-rust-500">开局</Link> 了。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="mb-2 font-serif text-lg text-rust-300">进行中 · {active.length}</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {active.map(x => (
                  <SessionCard key={x.session.id} row={x} />
                ))}
              </ul>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h2 className="mb-2 font-serif text-lg text-ink-300">过往 · {past.length}</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {past.map(x => (
                  <SessionCard key={x.session.id} row={x} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SessionCard({
  row,
}: {
  row: {
    session: SessionRow;
    investigator_name: string;
    module_title: string;
    turn_count: number;
  };
}) {
  const { session, investigator_name, module_title, turn_count } = row;
  const isActive = session.status === 'active';
  const href = isActive ? `/sessions/${session.id}` : `/sessions/${session.id}/summary`;
  const cta = isActive ? '继续' : '看复盘';

  return (
    <li>
      <Link
        href={href}
        className={
          'block rounded border p-4 transition ' +
          (isActive
            ? 'border-rust-600/60 bg-rust-700/10 hover:border-rust-500'
            : 'border-ink-700 bg-ink-900 hover:border-rust-500')
        }
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-serif text-base">
              {investigator_name}
              <span className="mx-2 text-ink-500">·</span>
              <span className="text-ink-200">{module_title}</span>
            </h3>
          </div>
          <StatusBadge status={session.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-ink-400">
          <div className="flex gap-3">
            <span>回合 {turn_count}</span>
            <span>游戏时 {session.game_clock.elapsed_minutes} 分</span>
            {session.ending && <span>结局 · {session.ending}</span>}
          </div>
          <div className="flex items-center gap-2">
            <time title={new Date(session.updated_at).toLocaleString('zh-CN')}>
              {relativeTime(session.updated_at)}
            </time>
            <span className="text-rust-500">{cta} →</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: StatusKey }) {
  const meta: Record<StatusKey, { label: string; cls: string }> = {
    active:    { label: '进行中', cls: 'border-rust-500/60 bg-rust-500/10 text-rust-200' },
    completed: { label: '已完成', cls: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' },
    abandoned: { label: '已放弃', cls: 'border-ink-600 bg-ink-800 text-ink-400' },
    failed:    { label: '失败',   cls: 'border-rust-700 bg-rust-700/20 text-rust-300' },
  };
  const m = meta[status];
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${m.cls}`}>
      {m.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}
