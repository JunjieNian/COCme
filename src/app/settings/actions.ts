'use server';

import { rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  setUserDeepSeekKey,
  clearUserDeepSeekKey,
  setUserVisualSettings,
} from '@/lib/localdb/users';
import { LocalDB, type UserVisualSettings } from '@/lib/localdb/db';

export async function saveDeepSeekKeyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = String(formData.get('key') ?? '').trim();

  if (!raw) {
    redirect(`/settings?error=${encodeURIComponent('key 不能为空')}`);
  }
  if (raw.length < 10 || raw.length > 200) {
    redirect(`/settings?error=${encodeURIComponent('key 长度看起来不对（应为 10-200 字符）')}`);
  }
  if (!raw.startsWith('sk-')) {
    redirect(`/settings?error=${encodeURIComponent('DeepSeek key 通常以 sk- 开头；确认一下是否贴错了？')}`);
  }

  try {
    await setUserDeepSeekKey(user.id, raw);
  } catch (err) {
    redirect(`/settings?error=${encodeURIComponent(`保存失败：${(err as Error).message}`)}`);
  }
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

export async function clearDeepSeekKeyAction(): Promise<void> {
  const user = await requireUser();
  try {
    await clearUserDeepSeekKey(user.id);
  } catch (err) {
    redirect(`/settings?error=${encodeURIComponent(`清除失败：${(err as Error).message}`)}`);
  }
  revalidatePath('/settings');
  redirect('/settings?cleared=1');
}

export async function saveVisualSettingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const enabled = formData.get('enabled') === 'on';
  const autoRaw = String(formData.get('auto') ?? 'normal');
  const baseUrl = String(formData.get('comfyui_base_url') ?? '').trim();
  const maxPerSessionRaw = Number(formData.get('max_per_session') ?? 6);

  if (enabled && !baseUrl) {
    redirect(`/settings?error=${encodeURIComponent('开启后必须填 ComfyUI 地址')}`);
  }
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    redirect(`/settings?error=${encodeURIComponent('ComfyUI 地址必须以 http:// 或 https:// 开头')}`);
  }

  const autoValues: UserVisualSettings['auto'][] = ['off', 'key_only', 'normal'];
  const auto = (autoValues as readonly string[]).includes(autoRaw)
    ? (autoRaw as UserVisualSettings['auto'])
    : 'normal';

  const maxPerSession = Math.max(1, Math.min(300, Math.round(maxPerSessionRaw || 60)));

  try {
    await setUserVisualSettings(user.id, {
      enabled,
      auto,
      provider: 'comfyui',
      comfyui_base_url: baseUrl.replace(/\/+$/, '') || 'http://127.0.0.1:8188',
      max_per_session: maxPerSession,
    });
  } catch (err) {
    redirect(`/settings?error=${encodeURIComponent(`保存失败：${(err as Error).message}`)}`);
  }
  revalidatePath('/settings');
  redirect('/settings?visual_saved=1');
}

// ---------------------------------------------------------------------------
// Danger zone: bulk wipe.
// Both actions require a matching confirmation string to avoid misclicks.
// Scope: only data owned by THIS user (owner_id match).
// ---------------------------------------------------------------------------

const CONFIRM_PHRASE = "删除";

/**
 * Wipe all visual_assets + image files owned by this user.
 * Keeps sessions / investigators / modules intact.
 */
export async function clearAllVisualsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== CONFIRM_PHRASE) {
    redirect(`/settings?error=${encodeURIComponent(`请在确认框里输入 "${CONFIRM_PHRASE}"`)}`);
  }

  const db = await LocalDB.get();
  const dataDir = process.env["LOCAL_DATA_DIR"] ?? join(process.cwd(), "data");

  // Collect image paths to delete before we wipe the rows.
  const mine = db.visual_assets.filter(a => a.user_id === user.id);
  const pathsToDelete: string[] = [];
  for (const a of mine) {
    if (a.image_path) pathsToDelete.push(join(dataDir, a.image_path));
  }

  // Wipe rows.
  await db.mutate(["visual_assets"], d => {
    d.visual_assets = d.visual_assets.filter(a => a.user_id !== user.id);
  });

  // Best-effort file deletion.  A missing file is fine; the row is already gone.
  for (const p of pathsToDelete) {
    try {
      await unlink(p);
    } catch {
      /* ignore */
    }
  }

  revalidatePath("/settings");
  redirect(`/settings?purged_visuals=${mine.length}`);
}

/**
 * Wipe all session-scoped data owned by this user:
 *   sessions, session_investigator_states, turns, checks,
 *   session_events, session_clues, session_npcs, growth_records, visual_assets.
 * Keeps: users (self), investigators, modules (reusable across new runs).
 */
export async function clearAllSessionsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== CONFIRM_PHRASE) {
    redirect(`/settings?error=${encodeURIComponent(`请在确认框里输入 "${CONFIRM_PHRASE}"`)}`);
  }

  const db = await LocalDB.get();
  const dataDir = process.env["LOCAL_DATA_DIR"] ?? join(process.cwd(), "data");

  const mySessionIds = new Set(db.sessions.filter(s => s.owner_id === user.id).map(s => s.id));
  const myVisuals = db.visual_assets.filter(a => a.user_id === user.id);
  const imagePaths = myVisuals.map(a => a.image_path).filter((p): p is string => p !== null);

  await db.mutate(
    [
      "sessions",
      "session_investigator_states",
      "turns",
      "checks",
      "session_events",
      "session_clues",
      "session_npcs",
      "growth_records",
      "visual_assets",
    ],
    d => {
      d.sessions = d.sessions.filter(s => s.owner_id !== user.id);
      d.session_investigator_states = d.session_investigator_states.filter(s => !mySessionIds.has(s.session_id));
      d.turns = d.turns.filter(t => !mySessionIds.has(t.session_id));
      d.checks = d.checks.filter(c => !mySessionIds.has(c.session_id));
      d.session_events = d.session_events.filter(e => !mySessionIds.has(e.session_id));
      d.session_clues = d.session_clues.filter(c => !mySessionIds.has(c.session_id));
      d.session_npcs = d.session_npcs.filter(n => !mySessionIds.has(n.session_id));
      d.growth_records = d.growth_records.filter(g => !mySessionIds.has(g.session_id));
      d.visual_assets = d.visual_assets.filter(a => a.user_id !== user.id);
    },
  );

  for (const rel of imagePaths) {
    try {
      await unlink(join(dataDir, rel));
    } catch {
      /* ignore */
    }
  }
  // Also prune the visuals directory if it is now empty.
  try {
    await rm(join(dataDir, "assets", "visuals"), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  revalidatePath("/settings");
  revalidatePath("/sessions");
  redirect(`/settings?purged_sessions=${mySessionIds.size}`);
}

