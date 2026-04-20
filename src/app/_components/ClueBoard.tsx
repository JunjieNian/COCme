'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredClueView } from '@/engine/projection';
import type { VisualListItem } from '@/app/api/visuals/session/[id]/route';

/**
 * Sidebar "clue board".  Shows discovered clues most-recent-first.  Each can
 * be expanded to read its full text; if the visual-evidence layer has
 * generated an image for that clue, it's shown above the text.
 *
 * Polling strategy: whenever at least one asset is still queued/generating,
 * poll every 4s.  Stop as soon as everything is terminal (ready/failed/
 * skipped) — no reason to keep hammering the server.
 */

const POLL_INTERVAL_MS = 4_000;

export function ClueBoard({
  clues,
  sessionId,
}: {
  clues: DiscoveredClueView[];
  sessionId: string;
}) {
  const [visuals, setVisuals] = useState<Record<string, VisualListItem>>({});
  // Track the last updated_at we've seen per id, so we can force <img> reload
  // when the asset transitions queued -> ready without the src URL changing.
  const cacheBustRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/visuals/session/${sessionId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { items: VisualListItem[] };
        if (cancelled) return;
        const map: Record<string, VisualListItem> = {};
        for (const it of data.items) {
          if (it.target_type !== 'clue') continue;
          map[it.target_key] = it;
          cacheBustRef.current[it.id] = it.updated_at;
        }
        setVisuals(map);

        const stillPending = data.items.some(
          it => it.status === 'queued' || it.status === 'generating',
        );
        if (stillPending && !cancelled) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        // Network hiccup — retry once after the normal interval.
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, clues.length]);  // re-run when a new clue is discovered

  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-4 text-sm">
      <h3 className="mb-2 flex items-center justify-between font-serif text-lg">
        <span>线索板</span>
        <span className="text-xs text-ink-400">{clues.length}</span>
      </h3>
      {clues.length === 0 ? (
        <p className="text-xs text-ink-500">尚未发现线索。</p>
      ) : (
        <ul className="space-y-2">
          {[...clues].reverse().map(c => (
            <ClueItem
              key={c.key}
              clue={c}
              visual={visuals[c.key]}
              cacheBust={visuals[c.key] ? cacheBustRef.current[visuals[c.key]!.id] : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClueItem({
  clue,
  visual,
  cacheBust,
}: {
  clue: DiscoveredClueView;
  visual: VisualListItem | undefined;
  cacheBust: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-l border-rust-700/60 pl-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left text-ink-100 hover:text-rust-500"
      >
        <span className="font-serif">{clue.name}</span>
        <span className="ml-2 text-xs text-ink-500">{open ? '▾' : '▸'}</span>
        {visual && <StatusDot status={visual.status} />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs">
          {visual && <VisualPanel visual={visual} cacheBust={cacheBust} />}
          <p className="text-ink-300 whitespace-pre-wrap">{clue.text}</p>
          {clue.context && <p className="text-ink-500">发现场合：{clue.context}</p>}
        </div>
      )}
    </li>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'ready'
      ? 'text-amber-300'
      : status === 'failed'
      ? 'text-rust-500'
      : status === 'skipped'
      ? 'text-ink-500'
      : 'text-ink-400 animate-pulse';
  const sym = status === 'ready' ? '◆' : status === 'failed' ? '⨯' : '◌';
  return <span className={`ml-2 text-[10px] ${cls}`} title={status}>{sym}</span>;
}

function VisualPanel({
  visual,
  cacheBust,
}: {
  visual: VisualListItem;
  cacheBust: string | undefined;
}) {
  if (visual.status === 'ready') {
    const src = `/api/visuals/${visual.id}/image${cacheBust ? `?t=${encodeURIComponent(cacheBust)}` : ''}`;
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded border border-ink-700 hover:border-rust-500"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={visual.caption}
          className="w-full object-cover"
          loading="lazy"
          style={{ imageRendering: 'pixelated' }}
        />
      </a>
    );
  }

  if (visual.status === 'failed') {
    return (
      <p className="rounded border border-rust-700/60 bg-rust-700/10 px-2 py-1 text-[11px] text-rust-300">
        图像生成失败{visual.error ? `：${visual.error.slice(0, 120)}` : ''}
      </p>
    );
  }

  if (visual.status === 'skipped') return null;

  return (
    <p className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-[11px] text-ink-400">
      <span className="animate-pulse">暗房冲洗中…</span>
    </p>
  );
}
