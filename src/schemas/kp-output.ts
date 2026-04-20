import { z } from 'zod';
import { StateOp } from './state-op.js';

/** A check the KP is ASKING the player to attempt. Server decides the actual roll. */
export const CheckRequest = z.object({
  kind: z.enum(['skill', 'characteristic', 'opposed', 'san', 'luck', 'damage', 'custom']),
  skill_or_stat: z.string().min(1).nullable(),
  difficulty: z.enum(['regular', 'hard', 'extreme']).default('regular'),
  bonus_dice: z.number().int().min(0).max(3).default(0),
  penalty_dice: z.number().int().min(0).max(3).default(0),
  allow_push: z.boolean().default(true),
  note: z.string().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

/**
 * Per-turn visual brief consumed by the image-generation trigger.  MUST be
 * spoiler-safe (only things the player has already seen / is seeing right
 * now), MUST be in English (FLUX / SDXL prefer English tokens).  If absent,
 * the trigger falls back to the static scene.visual_hint.
 */
export const VisualBrief = z.object({
  /** Short English noun phrase describing what the image should show. <= 200 chars. */
  subject: z.string().min(1).max(200),
  /** English mood words (comma-separated or free form). <= 120 chars. */
  mood: z.string().max(120).optional(),
  /** English palette/lighting hints.  e.g. "cold blue gray, rainlit, sodium streetlamp". <= 120 chars. */
  palette: z.string().max(120).optional(),
  /** English things that must NOT appear (e.g. the true identity of a suspect). */
  must_not_show: z.array(z.string().max(80)).max(8).default([]),
});
export type VisualBrief = z.infer<typeof VisualBrief>;

/**
 * The strict JSON contract the KP model must return every turn.
 * Fields:
 *   - visible_narration: the only text the player will be shown this turn.
 *   - player_options: up to 6 suggested actions (player can also freely type).
 *   - required_check: if set, the next player action triggers this check.
 *   - state_ops: proposed state mutations; server validates + applies.
 *   - hidden_notes: scratchpad visible ONLY to the Archivist / next turn's KP.
 *   - visual_brief: spoiler-safe English image brief for this turn's scene shot.
 */
export const KpOutput = z.object({
  scene_id: z.string().min(1),
  visible_narration: z.string().min(1),
  player_options: z.array(z.string().min(1)).max(6).default([]),
  required_check: CheckRequest.nullable().default(null),
  state_ops: z.array(StateOp).default([]),
  hidden_notes: z.array(z.string()).default([]),
  visual_brief: VisualBrief.nullish(),
});
export type KpOutput = z.infer<typeof KpOutput>;
