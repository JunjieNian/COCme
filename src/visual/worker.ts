import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LocalDB, type VisualAssetRow, type UserVisualSettings } from '../lib/localdb/db.js';
import { createComfyUiProvider } from './providers/comfyui.js';
import type { ImageProvider, ProviderError } from './types.js';

/**
 * Single-process async worker for visual_assets.
 *
 * - Jobs enter via enqueueVisualJob() (turn route does this after commit).
 * - The worker loop runs one job at a time, writes image bytes under
 *   data/assets/visuals/<id>.png, flips status to 'ready' or 'failed'.
 * - Worker is anchored to globalThis so Next.js dev mode's module
 *   re-evaluation doesn't start two loops.
 * - No retry for transient errors yet; the user can re-enqueue from the UI.
 */

const GLOBAL_KEY = Symbol.for('__coc_visual_worker__');
type GlobalHolder = { [GLOBAL_KEY]?: WorkerState };

interface WorkerState {
  queue: string[];           // asset ids, queued order
  seen: Set<string>;         // dedupe quick-check for enqueued ids
  running: boolean;
}

function getState(): WorkerState {
  const holder = globalThis as unknown as GlobalHolder;
  let s = holder[GLOBAL_KEY];
  if (!s) {
    s = { queue: [], seen: new Set(), running: false };
    holder[GLOBAL_KEY] = s;
  }
  return s;
}

export function enqueueVisualJob(assetId: string): void {
  const s = getState();
  if (s.seen.has(assetId)) return;
  s.seen.add(assetId);
  s.queue.push(assetId);
  if (!s.running) {
    s.running = true;
    // Fire and forget; any throw inside drain is swallowed and just stops the loop.
    drain().catch(err => {
      console.error('[visual.worker] drain crashed:', err);
    });
  }
}

async function drain(): Promise<void> {
  const s = getState();
  try {
    while (s.queue.length > 0) {
      const id = s.queue.shift()!;
      s.seen.delete(id);
      try {
        await processOne(id);
      } catch (err) {
        console.error(`[visual.worker] job ${id} threw:`, err);
      }
    }
  } finally {
    s.running = false;
  }
}

async function processOne(assetId: string): Promise<void> {
  const db = await LocalDB.get();
  const asset = db.visual_assets.find(a => a.id === assetId);
  if (!asset) return;
  if (asset.status !== 'queued') return;

  // Resolve provider settings from the owning user's config.
  const user = db.users.find(u => u.id === asset.user_id);
  const settings = user?.visual_settings;
  if (!settings || !settings.enabled) {
    await failAsset(assetId, '用户未开启图片生成');
    return;
  }

  const provider = providerFromSettings(settings);
  if (!provider) {
    await failAsset(assetId, `未知 provider: ${settings.provider}`);
    return;
  }

  await updateAsset(assetId, a => {
    a.status = 'generating';
  });

  try {
    const result = await provider.generate({
      prompt: asset.prompt_en,
      negativePrompt: asset.negative_prompt,
      seed: asset.seed,
      width: asset.width,
      height: asset.height,
    });

    const relPath = `assets/visuals/${asset.id}.png`;
    const dataDir = process.env['LOCAL_DATA_DIR'] ?? join(process.cwd(), 'data');
    const absPath = join(dataDir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, result.bytes);

    await updateAsset(assetId, a => {
      a.status = 'ready';
      a.image_path = relPath;
      a.error = null;
      a.model = result.model;
      a.provider = result.provider;
    });
  } catch (err) {
    const e = err as Partial<ProviderError> & Error;
    await failAsset(assetId, e.message || 'unknown error');
  }
}

function providerFromSettings(s: UserVisualSettings): ImageProvider | null {
  if (s.provider === 'comfyui') return createComfyUiProvider(s.comfyui_base_url);
  return null;
}

async function updateAsset(
  assetId: string,
  mut: (a: VisualAssetRow) => void,
): Promise<void> {
  const db = await LocalDB.get();
  await db.mutate(['visual_assets'], d => {
    const a = d.visual_assets.find(x => x.id === assetId);
    if (!a) return;
    mut(a);
    a.updated_at = new Date().toISOString();
  });
}

async function failAsset(assetId: string, error: string): Promise<void> {
  await updateAsset(assetId, a => {
    a.status = 'failed';
    a.error = error;
  });
}

/**
 * Re-enqueue on startup: any asset stuck in 'queued' or 'generating' gets
 * picked up again (generating -> queued first).  Call this once per process
 * boot from a route that already touches the DB.
 */
export async function resumeStuckJobs(): Promise<void> {
  const db = await LocalDB.get();
  const stuck = db.visual_assets.filter(a => a.status === 'generating' || a.status === 'queued');
  if (stuck.length === 0) return;
  await db.mutate(['visual_assets'], d => {
    for (const a of d.visual_assets) {
      if (a.status === 'generating') a.status = 'queued';
    }
  });
  for (const a of stuck) enqueueVisualJob(a.id);
}
