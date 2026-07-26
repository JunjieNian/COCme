import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { LocalDB, type UserRow, type UserVisualSettings } from './db';

export interface PublicUser {
  id: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = await LocalDB.get();
  const e = normalizeEmail(email);
  return db.users.find(u => u.email === e) ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const db = await LocalDB.get();
  return db.users.find(u => u.id === id) ?? null;
}

export async function registerUser(params: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const email = normalizeEmail(params.email);
  if (!EMAIL_RE.test(email)) return { error: '邮箱格式不正确' };
  if (params.password.length < 6) return { error: '密码至少 6 位' };
  if (params.password.length > 200) return { error: '密码过长' };

  const existing = await findUserByEmail(email);
  if (existing) return { error: '该邮箱已被注册' };

  const password_hash = await bcrypt.hash(params.password, 10);
  const user: UserRow = {
    id: randomUUID(),
    email,
    password_hash,
    created_at: new Date().toISOString(),
  };

  const db = await LocalDB.get();
  await db.mutate(['users'], d => {
    d.users.push(user);
  });

  return { user: { id: user.id, email: user.email } };
}

export async function verifyLogin(params: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const row = await findUserByEmail(params.email);
  if (!row) return { error: '邮箱或密码错误' };
  const ok = await bcrypt.compare(params.password, row.password_hash);
  if (!ok) return { error: '邮箱或密码错误' };
  return { user: { id: row.id, email: row.email } };
}

// ---------------------------------------------------------------------------
// Per-user visual (image generation) settings.
// ---------------------------------------------------------------------------

export const DEFAULT_VISUAL_SETTINGS: UserVisualSettings = {
  enabled: true,
  auto: 'normal',
  provider: 'comfyui',
  comfyui_base_url: 'http://127.0.0.1:8188',
  // One scene shot per KP turn + clue shots — a 20-turn session with a few
  // clue reveals can hit 25+.  Keep some headroom.
  max_per_session: 60,
};

export async function getUserVisualSettings(userId: string): Promise<UserVisualSettings> {
  const row = await findUserById(userId);
  return row?.visual_settings ?? { ...DEFAULT_VISUAL_SETTINGS };
}

export async function setUserVisualSettings(
  userId: string,
  patch: Partial<UserVisualSettings>,
): Promise<UserVisualSettings> {
  const db = await LocalDB.get();
  let next: UserVisualSettings = { ...DEFAULT_VISUAL_SETTINGS };
  await db.mutate(['users'], d => {
    const row = d.users.find(u => u.id === userId);
    if (!row) throw new Error('user not found');
    const current = row.visual_settings ?? { ...DEFAULT_VISUAL_SETTINGS };
    next = { ...current, ...patch };
    row.visual_settings = next;
  });
  return next;
}
