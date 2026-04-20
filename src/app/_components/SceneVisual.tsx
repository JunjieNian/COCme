'use client';

import { useEffect, useRef, useState } from 'react';
import type { VisualListItem } from '@/app/api/visuals/session/[id]/route';

/**
 * Per-turn scene image banner — shown above the narration card.
 *
 * We generate one scene asset PER turn (keyed by the KP turn's UUID), so
 * the "current image" is simply the most recent asset with
 * target_type='scene' for this session.  Polls while the latest one is
 * still queued/generating.
 */

const POLL_INTERVAL_MS = 4_000;

export function SceneVisual({ sessionId, turnIndex }: { sessionId: string; turnIndex: number }) {
  const [asset, setAsset] = useState<VisualListItem | null>(null);
  const cacheBustRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/visuals/session/${sessionId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { items: VisualListItem[] };
        if (cancelled) return;

        const scenes = data.items.filter(it => it.target_type === 'scene');
        // Most recent by updated_at.
        scenes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        const latest = scenes[0] ?? null;
        if (latest) cacheBustRef.current = latest.updated_at;
        setAsset(latest);

        if (latest && (latest.status === 'queued' || latest.status === 'generating') && !cancelled) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Re-run when turn index advances -> new scene asset should appear.
  }, [sessionId, turnIndex]);

  if (!asset) return null;

  if (asset.status === 'ready') {
    const src = `/api/visuals/${asset.id}/image${cacheBustRef.current ? `?t=${encodeURIComponent(cacheBustRef.current)}` : ''}`;
    return (
      <figure className="overflow-hidden rounded border border-ink-700 bg-ink-900">
        <a href={src} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={asset.caption}
            className="block w-full"
            loading="eager"
            style={{ imageRendering: 'pixelated' }}
          />
        </a>
        <figcaption className="border-t border-ink-700 px-3 py-1.5 text-[11px] uppercase tracking-widest text-ink-400">
          {asset.caption}
        </figcaption>
      </figure>
    );
  }

  if (asset.status === 'failed') {
    return (
      <div className="rounded border border-rust-700/60 bg-rust-700/10 px-3 py-2 text-xs text-rust-300">
        定场图生成失败{asset.error ? `：${asset.error.slice(0, 140)}` : ''}
      </div>
    );
  }

  if (asset.status === 'skipped') return null;

  return (
    <div className="flex items-center justify-center rounded border border-dashed border-ink-700 bg-ink-950 px-3 py-6 text-xs text-ink-400">
      <span className="animate-pulse">定场图冲洗中…</span>
    </div>
  );
}
