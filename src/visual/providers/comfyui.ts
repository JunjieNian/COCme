import { randomUUID } from 'node:crypto';
import { fluxSchnellWorkflow } from '../workflows/flux-schnell.js';
import {
  makeProviderError,
  type GenerateImageInput,
  type GenerateImageResult,
  type ImageProvider,
} from '../types.js';

interface ComfyHistoryItem {
  outputs?: Record<
    string,
    {
      images?: Array<{ filename: string; subfolder?: string; type?: string }>;
    }
  >;
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: Array<[string, Record<string, unknown>]>;
  };
}

function cleanBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function findFirstImage(outputs: NonNullable<ComfyHistoryItem['outputs']>) {
  for (const node of Object.values(outputs)) {
    const img = node?.images?.[0];
    if (img) return img;
  }
  return null;
}

export function createComfyUiProvider(baseUrl: string): ImageProvider {
  const base = cleanBase(baseUrl);

  return {
    id: 'comfyui',
    model: 'flux1-schnell',

    async generate(input: GenerateImageInput): Promise<GenerateImageResult> {
      const clientId = randomUUID();
      const workflow = fluxSchnellWorkflow({
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        seed: input.seed,
      });

      let submit: Response;
      try {
        submit = await fetch(`${base}/prompt`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, prompt: workflow }),
        });
      } catch (err) {
        throw makeProviderError(
          `无法连接 ComfyUI (${base}): ${(err as Error).message}`,
          true,
        );
      }

      if (!submit.ok) {
        const body = await submit.text().catch(() => '');
        throw makeProviderError(
          `ComfyUI /prompt 返回 ${submit.status}：${body.slice(0, 400)}`,
          submit.status >= 500,
        );
      }

      const submitted = (await submit.json()) as { prompt_id?: string; error?: unknown };
      const promptId = submitted.prompt_id;
      if (!promptId) {
        throw makeProviderError(
          `ComfyUI 没有返回 prompt_id：${JSON.stringify(submitted).slice(0, 400)}`,
          false,
        );
      }

      // Poll /history up to ~180s.  ComfyUI also supports /ws progress but
      // polling is simpler and matches our async-job model.
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await sleep(1000);

        let hist: Response;
        try {
          hist = await fetch(`${base}/history/${promptId}`);
        } catch {
          continue; // transient
        }
        if (!hist.ok) continue;

        const json = (await hist.json()) as Record<string, ComfyHistoryItem>;
        const item = json[promptId];
        if (!item) continue;

        // ComfyUI marks failed jobs with status_str === 'error'.
        if (item.status?.status_str === 'error') {
          const msg = extractComfyError(item);
          throw makeProviderError(`ComfyUI 生成失败：${msg}`, false);
        }

        if (!item.outputs) continue;
        const image = findFirstImage(item.outputs);
        if (!image) continue;

        const viewUrl =
          `${base}/view?filename=${encodeURIComponent(image.filename)}` +
          `&subfolder=${encodeURIComponent(image.subfolder ?? '')}` +
          `&type=${encodeURIComponent(image.type ?? 'output')}`;

        let imgRes: Response;
        try {
          imgRes = await fetch(viewUrl);
        } catch (err) {
          throw makeProviderError(
            `ComfyUI /view 取图失败：${(err as Error).message}`,
            true,
          );
        }
        if (!imgRes.ok) {
          throw makeProviderError(
            `ComfyUI /view 返回 ${imgRes.status}`,
            imgRes.status >= 500,
          );
        }

        const bytes = Buffer.from(await imgRes.arrayBuffer());
        return {
          bytes,
          mime: 'image/png',
          provider: 'comfyui',
          model: 'flux1-schnell',
          seed: input.seed,
        };
      }

      throw makeProviderError('ComfyUI 生成超时（180s 未完成）', true);
    },
  };
}

function extractComfyError(item: ComfyHistoryItem): string {
  const messages = item.status?.messages ?? [];
  for (const [kind, payload] of messages) {
    if (kind === 'execution_error' && payload) {
      const msg = (payload as { exception_message?: string; exception_type?: string }).exception_message;
      if (msg) return msg.slice(0, 300);
    }
  }
  return item.status?.status_str ?? 'unknown error';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
