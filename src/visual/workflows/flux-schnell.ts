/**
 * ComfyUI workflow for FLUX.1 [schnell] with a pixel-art finishing pass.
 *
 * Pipeline:
 *   CheckpointLoaderSimple (flux1-schnell-fp8.safetensors, all-in-one)
 *     ↓
 *   CLIPTextEncode × 2 (positive / empty negative)
 *     ↓
 *   EmptyLatentImage (`width` × `height`)  ← NB: tiny, e.g. 640×384
 *     ↓
 *   KSampler (4 steps, euler/simple, cfg=1)
 *     ↓
 *   VAEDecode  → full-res decoded image
 *     ↓
 *   ImageScale DOWN to `width/pixelBlock` × `height/pixelBlock` using 'area'
 *     (averages each N×N cell into a single color — this is the actual
 *     pixelation step)
 *     ↓
 *   ImageScale UP back to `width × height` using 'nearest-exact'
 *     (produces crisp square pixel blocks in the saved PNG, so browsers
 *     display proper pixel art regardless of their `image-rendering` hint)
 *     ↓
 *   SaveImage
 *
 * `pixelBlock = 4` = each logical pixel is 4×4 screen pixels (chunky 8-bit
 * look).  Smaller = finer, larger = more Pico-8.
 *
 * Requires:
 *   models/checkpoints/flux1-schnell-fp8.safetensors
 */

export interface FluxSchnellWorkflowParams {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  steps?: number;
  /** Size of one logical pixel in output-image pixels.  Default 4. */
  pixelBlock?: number;
}

const CHECKPOINT_NAME = 'flux1-schnell-fp8.safetensors';

export function fluxSchnellWorkflow(p: FluxSchnellWorkflowParams): Record<string, unknown> {
  const steps = p.steps ?? 4;
  const block = Math.max(1, p.pixelBlock ?? 4);

  // Both dims must divide evenly by block for a clean grid.  Round DOWN.
  const downW = Math.max(16, Math.floor(p.width / block));
  const downH = Math.max(16, Math.floor(p.height / block));

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: CHECKPOINT_NAME },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '', clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.width, height: p.height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1.0,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    // Downsample to the pixel grid (averages each NxN cell into one color).
    '7': {
      class_type: 'ImageScale',
      inputs: {
        image: ['6', 0],
        upscale_method: 'area',
        width: downW,
        height: downH,
        crop: 'disabled',
      },
    },
    // Upsample back to the intended output size with nearest-exact — keeps
    // pixel blocks crisp, no smoothing.
    '8': {
      class_type: 'ImageScale',
      inputs: {
        image: ['7', 0],
        upscale_method: 'nearest-exact',
        width: p.width,
        height: p.height,
        crop: 'disabled',
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'coc_visual', images: ['8', 0] },
    },
  };
}
