import { z } from 'zod';

/**
 * Canonical module schema.  Both user-uploaded scenarios and AI-generated
 * scenarios normalize to this structure before runtime.  Stored in
 * `modules.content` (JSONB) in Postgres.
 */

export const ModuleMeta = z.object({
  title: z.string().min(1),
  era: z.string().default('1920s'),
  tags: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),           // content warnings (gore, body-horror, ...)
  duration_min: z.number().int().positive().optional(),
});

export const ModuleLocation = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  features: z.array(z.string()).default([]),
});

export const ModuleNpc = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  motivations: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  stats: z
    .object({
      hp: z.number().int().positive().optional(),
      san: z.number().int().min(0).optional(),
      skills: z.record(z.string(), z.number().int().min(0).max(99)).optional(),
    })
    .optional(),
});

/**
 * Visual hint for the image-generation layer.  Everything here MUST be
 * spoiler-safe: no hidden truth, no NPC true identity, no un-revealed
 * clues.  It's only consumed to build a short English prompt for an image
 * model, and the resulting image is shown to the player AFTER the clue is
 * revealed.
 *
 * All fields optional — if absent, the trigger falls back to a generic
 * "evidence photo" treatment based on clue.name.
 */
export const VisualHint = z.object({
  kind: z
    .enum(['evidence_photo', 'handout', 'artifact_macro', 'location_establishing', 'npc_portrait', 'sanity_fragment'])
    .optional(),
  importance: z.enum(['minor', 'major', 'finale']).optional(),
  /** English noun phrase describing what's visible; <= 240 chars. */
  spoiler_safe_subject: z.string().max(240).optional(),
  mood: z
    .enum(['wet_noir', 'antiquarian', 'forensic', 'domestic_uncanny', 'rural_decay', 'institutional_dread', 'dreamlike'])
    .optional(),
  palette: z.enum(['sepia', 'cold_blue_gray', 'sickly_green', 'warm_lamplight', 'black_and_umber']).optional(),
  /** English phrases that MUST NOT appear in the image (e.g. "readable text", "sender's identity"). */
  must_not_show: z.array(z.string()).default([]),
});
export type VisualHint = z.infer<typeof VisualHint>;

export const ModuleClue = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  found_at: z.array(z.string()).default([]),           // location keys
  requires_check: z
    .object({
      skill: z.string(),
      difficulty: z.enum(['regular', 'hard', 'extreme']).default('regular'),
    })
    .optional(),
  reveals: z.array(z.string()).default([]),            // other clue keys this unlocks
  visual_hint: VisualHint.optional(),
});

export const ModuleSceneTransition = z.object({
  to: z.string().min(1),                                // scene id
  condition: z.string().optional(),                     // free-form; KP interprets
});

export const ModuleSceneNode = z.object({
  id: z.string().min(1),
  title: z.string(),
  setup: z.string(),                                    // KP-facing setup text
  on_enter: z.array(z.string()).default([]),            // side effects as free-form instructions
  transitions: z.array(ModuleSceneTransition).default([]),
  visual_hint: VisualHint.optional(),                   // optional establishing-shot hint
});

export const ModuleEncounter = z.object({
  key: z.string().min(1),
  description: z.string(),
  opponents: z
    .array(z.object({ npc_key: z.string().optional(), name: z.string(), hp: z.number().int().positive() }))
    .default([]),
});

export const ModuleEndingCondition = z.object({
  key: z.string().min(1),
  label: z.string(),                                    // 'good' | 'pyrrhic' | 'bad' | 'dead' | 'insane' | 'escaped' | custom
  requires: z.array(z.string()).default([]),            // predicate strings interpretable by KP layer
});

export const ModuleContent = z.object({
  meta: ModuleMeta,
  premise: z.string().min(1),
  locations: z.array(ModuleLocation).default([]),
  npcs: z.array(ModuleNpc).default([]),
  clues: z.array(ModuleClue).default([]),
  truth_graph: z
    .object({
      nodes: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      edges: z
        .array(z.object({ from: z.string(), to: z.string(), relation: z.string().optional() }))
        .default([]),
    })
    .default({ nodes: [], edges: [] }),
  scene_nodes: z.array(ModuleSceneNode).min(1),
  encounters: z.array(ModuleEncounter).default([]),
  ending_conditions: z.array(ModuleEndingCondition).min(1),
});
export type ModuleContent = z.infer<typeof ModuleContent>;
