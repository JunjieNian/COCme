import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/visuals/[id]/image
// Returns raw PNG bytes for a ready visual asset.  Owner-scoped so one user
// can't peek at another's images.
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const user = await requireUser();
  const db = await LocalDB.get();
  const asset = db.visual_assets.find(a => a.id === id);
  if (!asset) return new Response('not found', { status: 404 });
  if (asset.user_id !== user.id) return new Response('forbidden', { status: 403 });
  if (asset.status !== 'ready' || !asset.image_path) {
    return new Response('not ready', { status: 404 });
  }

  const dataDir = process.env['LOCAL_DATA_DIR'] ?? join(process.cwd(), 'data');
  const absPath = join(dataDir, asset.image_path);
  let bytes: Buffer;
  try {
    bytes = await readFile(absPath);
  } catch (err) {
    return new Response(`image file missing: ${(err as Error).message}`, { status: 410 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      // Short cache — ComfyUI regeneration on same id would change bytes.
      'Cache-Control': 'private, max-age=60',
    },
  });
}
