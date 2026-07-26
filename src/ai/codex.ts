import { Codex, type ModelReasoningEffort } from '@openai/codex-sdk';
import { KpOutput } from '../schemas/kp-output.js';
import { KP_SYSTEM_PROMPT } from './prompt.js';
import type { ChatCompletion } from './provider.js';
import { callJsonWithSchema } from './json-call.js';

// ---------------------------------------------------------------------------
// Codex SDK provider. It reuses the local Codex/ChatGPT login and never reads
// or accepts an OpenAI API key. Everything else targets the small
// ChatCompletion abstraction so tests do not need to start Codex.
// ---------------------------------------------------------------------------

export interface CodexConfig {
  chatModel?: string;
  reasonModel?: string;
  reasoningEffort?: ModelReasoningEffort;
  workingDirectory?: string;
  codexPathOverride?: string;
}

const REASONING_EFFORTS: ReadonlySet<string> = new Set([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

function readReasoningEffort(value: string | undefined): ModelReasoningEffort {
  const effort = value ?? 'low';
  if (!REASONING_EFFORTS.has(effort)) {
    throw new Error(
      `CODEX_REASONING_EFFORT must be one of ${[...REASONING_EFFORTS].join(', ')}; got ${effort}`,
    );
  }
  return effort as ModelReasoningEffort;
}

function buildPrompt(
  messages: Parameters<ChatCompletion>[0]['messages'],
  requireJson: boolean,
): string {
  const sections = messages.map(message => {
    const label =
      message.role === 'system'
        ? 'SYSTEM INSTRUCTION'
        : message.role === 'assistant'
          ? 'PREVIOUS ASSISTANT OUTPUT'
          : 'USER INPUT';
    return `<${label}>\n${message.content}\n</${label}>`;
  });

  return [
    'This is a non-coding structured-output task embedded in a game server.',
    'Do not inspect files, run commands, browse, call tools, or modify the workspace.',
    'Follow the supplied system instruction and return only the requested response.',
    ...(requireJson ? ['Return exactly one JSON object, with no Markdown or explanation.'] : []),
    ...sections,
  ].join('\n\n');
}

export function createCodex(cfg: Partial<CodexConfig> = {}): {
  chat: ChatCompletion;
  chatModel: string;
  reasonModel: string;
} {
  const chatModel = cfg.chatModel ?? process.env['CODEX_MODEL_CHAT'] ?? 'gpt-5.4-mini';
  const reasonModel = cfg.reasonModel ?? process.env['CODEX_MODEL_REASON'] ?? chatModel;
  const reasoningEffort = cfg.reasoningEffort
    ?? readReasoningEffort(process.env['CODEX_REASONING_EFFORT']);
  const workingDirectory = cfg.workingDirectory ?? process.cwd();

  // ChatGPT-authenticated Codex currently prefers WebSockets. Some Windows
  // networks cannot complete that TLS handshake and wait through five retries
  // before HTTP fallback. This provider uses the same ChatGPT auth endpoint
  // directly over Responses HTTP/SSE.
  const codex = new Codex({
    ...(cfg.codexPathOverride ? { codexPathOverride: cfg.codexPathOverride } : {}),
    config: {
      model_provider: 'chatgpt-http',
      model_providers: {
        'chatgpt-http': {
          name: 'ChatGPT HTTP',
          base_url: 'https://chatgpt.com/backend-api/codex',
          wire_api: 'responses',
          requires_openai_auth: true,
          supports_websockets: false,
        },
      },
      web_search: 'disabled',
      features: {
        apps: false,
        multi_agent: false,
        plugins: false,
        remote_plugin: false,
        shell_snapshot: false,
        tool_suggest: false,
      },
    },
  });

  const chat: ChatCompletion = async (req) => {
    const thread = codex.startThread({
      model: req.model,
      modelReasoningEffort: reasoningEffort,
      sandboxMode: 'read-only',
      approvalPolicy: 'never',
      webSearchMode: 'disabled',
      workingDirectory,
    });

    try {
      const turn = await thread.run(
        buildPrompt(req.messages, req.response_format?.type === 'json_object'),
        {
          ...(req.output_schema !== undefined ? { outputSchema: req.output_schema } : {}),
          ...(req.signal !== undefined ? { signal: req.signal } : {}),
        },
      );
      return { content: turn.finalResponse || null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Codex call failed. Confirm that "codex login status" shows a ChatGPT login. ${message}`,
      );
    }
  };

  return { chat, chatModel, reasonModel };
}

// ---------------------------------------------------------------------------
// callKp: one KP turn.  Thin wrapper around callJsonWithSchema.
// ---------------------------------------------------------------------------

export interface KpTurnContext {
  context: unknown;
}

export interface CallKpOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRepairAttempts?: number;
  signal?: AbortSignal;
}

export async function callKp(
  { context }: KpTurnContext,
  opts: CallKpOptions = {},
  deps: { chat: ChatCompletion; chatModel: string } = createCodex(),
): Promise<KpOutput> {
  const system = opts.systemPrompt ?? KP_SYSTEM_PROMPT;
  const model = opts.model ?? deps.chatModel;

  return callJsonWithSchema(
    KpOutput,
    [
      { role: 'system', content: system },
      { role: 'user', content: typeof context === 'string' ? context : JSON.stringify(context) },
    ],
    {
      model,
      temperature: opts.temperature ?? 0.8,
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      maxRepairAttempts: opts.maxRepairAttempts ?? 1,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    },
    deps.chat,
  );
}
