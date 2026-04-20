import { randomUUID, createHash } from 'node:crypto';
import { LocalDB, type VisualAssetRow, type UserVisualSettings } from '../lib/localdb/db.js';
import type { ModuleContent, VisualHint } from '../schemas/module.js';
import type { KpOutput, VisualBrief } from '../schemas/kp-output.js';
import type { TurnDelta } from '../engine/persist.js';
import { buildVisualPrompt, fallbackHint, fallbackSubjectFromClueName } from './prompt.js';
import { enqueueVisualJob } from './worker.js';

// ---------------------------------------------------------------------------
// After a successful turn commit, scan the delta for "public state changes
// worth illustrating" and enqueue asset rows.  Hidden notes / truth_graph /
// un-revealed clues are never inspected — we only touch `clue_upserts`.
//
// v1 scope: clue reveals only.  Scene/NPC/SAN hooks later.
// ---------------------------------------------------------------------------

export interface TriggerContext {
  userId: string;
  sessionId: string;
  moduleId: string;
  moduleContent: ModuleContent;
  settings: UserVisualSettings | undefined;
  delta: TurnDelta;
}

// Small canvases — FLUX Schnell 4-step + pixel-art post (downsample/upscale)
// runs in ~1-3s per image on H20.  The UI renders them with
// `image-rendering: pixelated` at 2-3x, so the low output resolution is
// actually the visual style, not a compromise.
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const SCENE_WIDTH = 640;
const SCENE_HEIGHT = 384;

export async function triggerVisualsFromDelta(ctx: TriggerContext): Promise<string[]> {
  const s = ctx.settings;
  if (!s || !s.enabled || s.auto === 'off') return [];

  const db = await LocalDB.get();

  // Cap per session — count existing assets for this session first.
  const existingCount = db.visual_assets.filter(a => a.session_id === ctx.sessionId).length;
  let budget = Math.max(0, s.max_per_session - existingCount);
  if (budget === 0) return [];

  const toInsert: VisualAssetRow[] = [];

  // -------- Per-turn scene shot --------
  // One establishing image per KP turn, keyed by the KP turn's UUID.
  //
  // Prompt priority (best fit for the CURRENT turn's narration first):
  //   1. kp_output.visual_brief  (the KP's per-turn English brief, matches
  //      lighting / materials / mood of what it just wrote)
  //   2. scene.visual_hint       (static hint authored on the module)
  //   3. fallback                (generic location-establishing on scene title)
  const currentSceneId = ctx.delta.session_patch.current_scene_id;
  const newKpTurn = ctx.delta.new_turns.find(t => t.actor === 'kp');
  if (newKpTurn && budget > 0) {
    const sceneDef = ctx.moduleContent.scene_nodes.find(n => n.id === currentSceneId);
    if (sceneDef) {
      const isOpening = newKpTurn.turn_index <= 2;
      const kpOutput = newKpTurn.kp_output as KpOutput | null | undefined;
      const brief = (kpOutput && 'visual_brief' in kpOutput ? kpOutput.visual_brief : null) ?? null;

      const staticFallback: VisualHint = {
        kind: 'location_establishing',
        importance: isOpening ? 'major' : 'minor',
        must_not_show: ['readable text', 'named deity', 'gore', 'modern smartphone'],
      };
      const staticHint = sceneDef.visual_hint ?? staticFallback;

      // Effective prompt context: KP brief overrides static subject/mood/palette
      // but we still honour the static hint's `kind` (evidence_photo vs handout
      // vs location_establishing — picked in the module) and its must_not_show
      // (the module author's hard rules) unioned with the KP's.
      const subject = brief?.subject?.trim()
        || staticHint.spoiler_safe_subject?.trim()
        || `the location titled "${sceneDef.title.slice(0, 80)}"`;
      const mood = brief?.mood?.trim() || staticHint.mood;
      const palette = brief?.palette?.trim() || staticHint.palette;
      const mustNotShow = dedupe([
        ...(brief?.must_not_show ?? []),
        ...(staticHint.must_not_show ?? []),
      ]);
      const importance: NonNullable<VisualHint['importance']> =
        brief ? (isOpening ? 'major' : 'minor') : (staticHint.importance ?? 'minor');

      if (s.auto !== 'key_only' || importance === 'major' || importance === 'finale') {
        const { prompt, negativePrompt } = buildVisualPrompt({
          era: ctx.moduleContent.meta.era,
          kind: staticHint.kind ?? 'location_establishing',
          subject,
          ...(mood !== undefined ? { mood } : {}),
          ...(palette !== undefined ? { palette } : {}),
          mustNotShow,
        });
        const seed = stableSeed(`${ctx.moduleId}:scene:${currentSceneId}:turn:${newKpTurn.id}`);
        const now = new Date().toISOString();
        toInsert.push({
          id: randomUUID(),
          user_id: ctx.userId,
          session_id: ctx.sessionId,
          module_id: ctx.moduleId,
          target_type: 'scene',
          target_key: newKpTurn.id,
          status: 'queued',
          provider: s.provider,
          model: '',
          prompt_en: prompt,
          negative_prompt: negativePrompt,
          seed,
          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,
          image_path: null,
          caption: isOpening
            ? `开场：${sceneDef.title}`
            : `第 ${newKpTurn.turn_index} 回合 · ${sceneDef.title}`,
          error: null,
          created_at: now,
          updated_at: now,
        });
        budget--;
      }
    }
  }

  // -------- Clue evidence shots --------
  const newlyDiscovered = ctx.delta.clue_upserts.filter(c => c.discovered);
  const clueDefs = new Map(ctx.moduleContent.clues.map(c => [c.key, c]));

  for (const upsert of newlyDiscovered) {
    if (budget === 0) break;
    const def = clueDefs.get(upsert.clue_key);
    if (!def) continue;

    const hint = def.visual_hint ?? fallbackHint();
    if (s.auto === 'key_only' && hint.importance !== 'major' && hint.importance !== 'finale') continue;

    const existing = db.visual_assets.find(
      a => a.session_id === ctx.sessionId && a.target_type === 'clue' && a.target_key === def.key,
    );
    if (existing) continue;

    const subject = hint.spoiler_safe_subject?.trim() || fallbackSubjectFromClueName(def.name);
    const { prompt, negativePrompt } = buildVisualPrompt({
      era: ctx.moduleContent.meta.era,
      kind: hint.kind,
      subject,
      ...(hint.mood !== undefined ? { mood: hint.mood } : {}),
      ...(hint.palette !== undefined ? { palette: hint.palette } : {}),
      mustNotShow: hint.must_not_show ?? [],
    });

    const seed = stableSeed(`${ctx.moduleId}:${def.key}:v1`);
    const now = new Date().toISOString();
    toInsert.push({
      id: randomUUID(),
      user_id: ctx.userId,
      session_id: ctx.sessionId,
      module_id: ctx.moduleId,
      target_type: 'clue',
      target_key: def.key,
      status: 'queued',
      provider: s.provider,
      model: '',
      prompt_en: prompt,
      negative_prompt: negativePrompt,
      seed,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      image_path: null,
      caption: `证物：${def.name}`,
      error: null,
      created_at: now,
      updated_at: now,
    });
    budget--;
  }

  if (toInsert.length === 0) return [];

  await db.mutate(['visual_assets'], d => {
    d.visual_assets.push(...toInsert);
  });
  for (const a of toInsert) enqueueVisualJob(a.id);
  return toInsert.map(a => a.id);
}

export function stableSeed(text: string): number {
  const h = createHash('sha256').update(text).digest();
  // 31-bit unsigned — ComfyUI's KSampler accepts up to 2^32-1; keep it in a
  // signed-safe range to avoid JSON precision surprises.
  return h.readUInt32BE(0) & 0x7fffffff;
}

function dedupe<T>(xs: readonly T[]): T[] {
  return Array.from(new Set(xs));
}

/**
 * Backfill a scene image for a session that has no ready asset yet.
 * Called from the session page server component so a user who enables
 * visuals AFTER starting a session sees an image on first page load.
 *
 * The image is keyed against the LAST KP turn (so it survives the per-turn
 * image model — SceneVisual just shows the most recent 'scene' asset).
 * No-op if any scene asset already exists for this session.
 */
export interface BackfillContext {
  userId: string;
  sessionId: string;
  moduleId: string;
  moduleContent: ModuleContent;
  currentSceneId: string;
  /** Most recent KP turn id, for target_key stability.  Null -> bail. */
  lastKpTurnId: string | null;
  settings: UserVisualSettings | undefined;
}

export async function backfillCurrentSceneVisual(ctx: BackfillContext): Promise<string | null> {
  const s = ctx.settings;
  if (!s || !s.enabled || s.auto === 'off') return null;
  if (!ctx.lastKpTurnId) return null;

  const db = await LocalDB.get();

  // Any scene asset at all for this session?
  const existing = db.visual_assets.some(a => a.session_id === ctx.sessionId && a.target_type === 'scene');
  if (existing) return null;

  const count = db.visual_assets.filter(a => a.session_id === ctx.sessionId).length;
  if (count >= s.max_per_session) return null;

  const sceneDef = ctx.moduleContent.scene_nodes.find(n => n.id === ctx.currentSceneId);
  if (!sceneDef) return null;

  const fallback: VisualHint = {
    kind: 'location_establishing',
    importance: 'major',
    must_not_show: ['readable text', 'named deity', 'gore', 'modern smartphone'],
  };
  const hint = sceneDef.visual_hint ?? fallback;
  if (s.auto === 'key_only' && hint.importance !== 'major' && hint.importance !== 'finale') return null;

  const subject = hint.spoiler_safe_subject?.trim() || `the location titled "${sceneDef.title.slice(0, 80)}"`;
  const { prompt, negativePrompt } = buildVisualPrompt({
    era: ctx.moduleContent.meta.era,
    kind: hint.kind ?? 'location_establishing',
    subject,
    ...(hint.mood !== undefined ? { mood: hint.mood } : {}),
    ...(hint.palette !== undefined ? { palette: hint.palette } : {}),
    mustNotShow: hint.must_not_show ?? [],
  });

  const seed = stableSeed(`${ctx.moduleId}:scene:${ctx.currentSceneId}:turn:${ctx.lastKpTurnId}`);
  const now = new Date().toISOString();
  const row: VisualAssetRow = {
    id: randomUUID(),
    user_id: ctx.userId,
    session_id: ctx.sessionId,
    module_id: ctx.moduleId,
    target_type: 'scene',
    target_key: ctx.lastKpTurnId,
    status: 'queued',
    provider: s.provider,
    model: '',
    prompt_en: prompt,
    negative_prompt: negativePrompt,
    seed,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    image_path: null,
    caption: `场景：${sceneDef.title}`,
    error: null,
    created_at: now,
    updated_at: now,
  };
  await db.mutate(['visual_assets'], d => {
    // Re-check inside the mutex.
    if (d.visual_assets.some(a => a.session_id === ctx.sessionId && a.target_type === 'scene')) return;
    d.visual_assets.push(row);
  });
  enqueueVisualJob(row.id);
  return row.id;
}
