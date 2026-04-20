import { requireSessionOwner } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/visuals/session/[id]
// Returns all visual_assets for the given session, owner-scoped.  Used by
// the clue board to poll for ready images.
// ---------------------------------------------------------------------------

export interface VisualListItem {
  id: string;
  target_type: string;
  target_key: string;
  status: string;
  caption: string;
  error: string | null;
  has_image: boolean;
  updated_at: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  try {
    await requireSessionOwner(sessionId);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 403 });
  }

  const db = await LocalDB.get();
  const items: VisualListItem[] = db.visual_assets
    .filter(a => a.session_id === sessionId)
    .map(a => ({
      id: a.id,
      target_type: a.target_type,
      target_key: a.target_key,
      status: a.status,
      caption: a.caption,
      error: a.error,
      has_image: a.image_path !== null,
      updated_at: a.updated_at,
    }));

  return Response.json({ items });
}
