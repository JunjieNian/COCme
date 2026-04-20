import type { VisualHint } from '../schemas/module.js';

// ---------------------------------------------------------------------------
// Visual prompt templates.
//
// Principles:
//   - "Investigative evidence", not "creature poster": the horror is implied
//     through materials, lighting, and framing — not by showing the monster.
//   - English prompts (FLUX / SDXL prefer English tokens).
//   - Never include hidden truth — callers pass only the PlayerView-visible
//     `spoiler_safe_subject` (or a fallback derived from the public title).
//   - Avoid official CoC product-identity vocabulary.  Don't say "Call of
//     Cthulhu", "Cthulhu", "Nyarlathotep", "Arkham", "Chaosium", "style of
//     <official artist>", etc.  We describe the GENRE, not the brand.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Style: low-saturation retro pixel-horror.  Think 16-bit adventure / RPG
// horror (Yume Nikki, Ib, Faith, Petscop) — limited palette, hard pixel
// edges, chunky lighting, lots of negative space.  The ComfyUI workflow
// also runs a downsample-then-nearest-upsample pass so the image comes
// out with real pixel blocks, not just FLUX's soft "pixel-ish" aesthetic.
// ---------------------------------------------------------------------------

export const STYLE_CORE = [
  'pixel art',
  '16-bit horror adventure game screenshot',
  'limited indexed palette, 16 to 32 colors total',
  'desaturated muted palette, low saturation, washed-out tones',
  'hard pixel edges, visible square pixel blocks, no anti-aliasing',
  'dithered gradients, Bayer dither shading',
  'retro LCD / CRT monitor aesthetic',
  'moody low-key lighting, strong silhouettes, large areas of near-black',
  'sparse sprite detail, generous negative space, composition reads at a glance',
  'investigative cosmic horror atmosphere',
  'restrained dread, the horror is implied rather than shown',
].join(', ');

export const NEGATIVE_BASE = [
  'photorealistic',
  'photograph',
  'hd',
  '4k',
  'smooth gradients',
  'soft focus',
  'blurry',
  'anti-aliasing',
  'painterly brushwork',
  'oil painting',
  'watercolor',
  'vibrant colors',
  'saturated colors',
  'neon',
  'anime style',
  'chibi',
  'manga',
  'cute',
  'glossy game art',
  'comic book',
  'heroic fantasy',
  'official RPG book cover',
  'copyrighted characters',
  'named mythos deity',
  'readable text',
  'watermark',
  'logo',
  'signature',
  'jumpscare monster',
  'explicit gore',
  'dismemberment',
  'celebrity likeness',
  'modern smartphone',
].join(', ');

export const PRESET: Record<NonNullable<VisualHint['kind']>, string> = {
  evidence_photo:
    'pixel-art top-down evidence tile, a single prop centered on a dim floor, tiny numbered marker, cropped sprite composition, reads like a 16-bit item icon tile',
  handout:
    'pixel-art close-up of an aged document sprite on a dark surface, visible paper grain in pixels, blurred unreadable writing blocks, space at the bottom for UI text',
  artifact_macro:
    'pixel-art item icon sprite on near-black background, object centered, single rim light, chunky pixel outlines',
  location_establishing:
    'pixel-art establishing shot of the location, side-view or 3/4 top-down like a retro adventure game room, cropped tile scenery, atmospheric fog via dithering',
  npc_portrait:
    'pixel-art character portrait sprite, shoulders-up, plain dark background, quiet expression, no caricature, limited face palette',
  sanity_fragment:
    'pixel-art subjective vision, glitched scanlines, palette swap, broken tile repeats, symbolic and non-graphic, familiar space becoming subtly wrong',
};

const DEFAULT_KIND: NonNullable<VisualHint['kind']> = 'evidence_photo';

export interface VisualPromptContext {
  era: string;                       // '1920s' etc.
  kind: NonNullable<VisualHint['kind']> | undefined;
  subject: string;                   // spoiler-safe English phrase
  /**
   * Mood hint.  Either the module schema's enum values (snake_case, which we
   * expand) or free-form English from the KP's per-turn visual_brief.
   */
  mood?: string;
  /** Palette hint.  Same treatment as mood. */
  palette?: string;
  mustNotShow?: string[];
}

export function buildVisualPrompt(ctx: VisualPromptContext): { prompt: string; negativePrompt: string } {
  const kind = ctx.kind ?? DEFAULT_KIND;
  const preset = PRESET[kind];

  const parts: string[] = [
    `${preset} of ${ctx.subject}`,
    `${ctx.era} period details`,
  ];
  if (ctx.mood) parts.push(`mood: ${ctx.mood.replaceAll('_', ' ')}`);
  if (ctx.palette) parts.push(`palette: ${ctx.palette.replaceAll('_', ' ')}`);
  parts.push(STYLE_CORE);
  parts.push('no visible creature unless the player has already seen it');
  parts.push('no readable text');
  if (ctx.mustNotShow && ctx.mustNotShow.length > 0) {
    parts.push(`must not show: ${ctx.mustNotShow.join(', ')}`);
  }

  return {
    prompt: parts.join(', '),
    negativePrompt: NEGATIVE_BASE,
  };
}

// ---------------------------------------------------------------------------
// Fallback when a module clue has no visual_hint: guess "evidence photo of a
// handwritten clue / object / document" from the clue's public name.
// ---------------------------------------------------------------------------

export function fallbackSubjectFromClueName(name: string): string {
  // Prefix with a generic English noun that frames it as a pixel-art item
  // tile; the Chinese name survives in quotes because FLUX still picks up
  // some theming from it even if the final glyphs are garbled (which is
  // fine — pixel art text is expected to be unreadable).
  const trimmed = name.trim().slice(0, 80);
  return `a pixel-art investigation item tile representing "${trimmed}"`;
}

export function fallbackHint(): VisualHint {
  return {
    kind: 'evidence_photo',
    importance: 'minor',
    must_not_show: ['readable text', 'named deity', 'gore'],
  };
}
