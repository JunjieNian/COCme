/**
 * Image-generation provider interface.  Keep the surface small so we can add
 * a cloud provider (fal / replicate) later without touching the call sites.
 */

export interface GenerateImageInput {
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
}

export interface GenerateImageResult {
  bytes: Buffer;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  provider: string;
  model: string;
  seed: number;
}

export interface ImageProvider {
  id: string;
  model: string;
  generate(input: GenerateImageInput): Promise<GenerateImageResult>;
}

export interface ProviderError extends Error {
  /** true = probably transient (network, server down); false = bad prompt / auth / config. */
  transient: boolean;
}

export function makeProviderError(message: string, transient: boolean): ProviderError {
  const e = new Error(message) as ProviderError;
  e.transient = transient;
  return e;
}
