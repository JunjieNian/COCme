/**
 * Minimal provider interface so every AI call in this codebase talks to a
 * single abstract `ChatCompletion` function. This keeps the game logic
 * decoupled from the Codex SDK and makes tests trivial -- just pass a
 * function.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  /** JSON Schema passed to Codex structured output. */
  output_schema?: unknown;
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  content: string | null;
}

export type ChatCompletion = (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
