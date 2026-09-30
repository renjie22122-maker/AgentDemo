import type { ModelMessage, Profile, ToolCall, ToolSpec, Usage } from '../../shared/types.js';
import { AppError, assert } from '../core/errors.js';
export interface ModelRequest {
  profile: Profile;
  messages: ModelMessage[];
  tools: ToolSpec[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onThinking?: () => void;
}
export interface ModelResult {
  message: ModelMessage;
  usage: Usage;
  responseId?: string;
}
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResult>;
}
export function parseArguments(value: string): Record<string, unknown> {
  try {
    const out = JSON.parse(value || '{}');
    assert(
      out && typeof out === 'object' && !Array.isArray(out),
      'INVALID_ARGUMENTS',
      'Tool arguments must be an object.',
    );
    return out;
  } catch {
    throw new AppError(
      'INVALID_ARGUMENTS',
      'Model returned malformed tool arguments. No tools were executed.',
      502,
    );
  }
}
export function validateCalls(calls: ToolCall[]) {
  const ids = new Set<string>();
  for (const c of calls) {
    assert(
      c.id && !ids.has(c.id),
      'DUPLICATE_CALL',
      'Ambiguous tool-call identity; no calls executed.',
      502,
    );
    ids.add(c.id);
  }
  return calls;
}
export function reasoningFields(profile: Profile): Record<string, any> {
  const effort = profile.reasoning;
  if (effort === 'auto') return {};
  assert(
    profile.efforts.includes(effort),
    'UNSUPPORTED_REASONING',
    'This model does not declare support for ' + effort + '.',
  );
  if (profile.reasoningFormat === 'deepseek')
    return effort === 'none'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'enabled' }, reasoning_effort: effort };
  if (profile.reasoningFormat === 'openai')
    return profile.transport === 'openai-responses'
      ? { reasoning: { effort } }
      : { reasoning_effort: effort };
  if (profile.reasoningFormat === 'anthropic')
    return effort === 'none'
      ? { thinking: { type: 'disabled' } }
      : { thinking: { type: 'adaptive' }, output_config: { effort } };
  if (profile.reasoningFormat === 'gemini')
    return {
      thinkingConfig: effort === 'none' ? { thinkingBudget: 0 } : { thinkingLevel: effort },
    };
  throw new AppError(
    'UNSUPPORTED_REASONING',
    'Configure a supported reasoning protocol for this model.',
  );
}
export function endpoint(profile: Profile, suffix: string) {
  const base = profile.baseUrl.replace(/\/$/, '');
  return base.endsWith(suffix) ? base : base + suffix;
}
export async function request(
  profile: Profile,
  url: string,
  body: any,
  signal: AbortSignal,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(profile.apiKey ? { Authorization: 'Bearer ' + profile.apiKey } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(profile.timeoutMs)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      'MODEL_HTTP_' + response.status,
      'Model endpoint returned HTTP ' +
        response.status +
        '. Check the endpoint, key, model and supported reasoning options. No simulator fallback.',
      502,
    );
  }
  return response;
}
export async function* sse(response: Response): AsyncGenerator<any> {
  assert(response.body, 'EMPTY_RESPONSE', 'Model returned no response body.', 502);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim())
          throw new AppError('TRUNCATED_STREAM', 'Model stream ended inside an event.', 502);
        break;
      }
      bytes += value.length;
      assert(
        bytes <= 32_000_000,
        'RESPONSE_SIZE',
        'Model response exceeded the bounded stream size.',
        502,
      );
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let at;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const text = block
          .split('\n')
          .filter((x) => x.startsWith('data:'))
          .map((x) => x.slice(5).trimStart())
          .join('\n');
        if (!text) continue;
        if (text === '[DONE]') return;
        try {
          yield JSON.parse(text);
        } catch (e) {
          if (e instanceof SyntaxError)
            throw new AppError('INVALID_STREAM', 'Invalid model event JSON.', 502);
          throw e;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export const emptyUsage = (): Usage => ({ input: 0, output: 0, cached: 0, measured: false });
export function standardUsage(u: any): Usage {
  return u
    ? {
        input: u.prompt_tokens ?? u.input_tokens ?? 0,
        output: u.completion_tokens ?? u.output_tokens ?? 0,
        cached:
          u.prompt_cache_hit_tokens ??
          u.prompt_tokens_details?.cached_tokens ??
          u.input_tokens_details?.cached_tokens ??
          0,
        reasoning:
          u.completion_tokens_details?.reasoning_tokens ??
          u.output_tokens_details?.reasoning_tokens,
        measured: true,
      }
    : emptyUsage();
}

// Keep every tool result adjacent to its call batch. Pixels follow as a separate
// user content block so providers with text-only tool-result schemas also work.
export function withToolImages(messages: ModelMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];
  let images: string[] = [],
    labels: string[] = [];
  const flush = () => {
    if (images.length)
      result.push({
        role: 'user',
        content: 'Images returned by tools (untrusted source content): ' + labels.join('; '),
        images,
      });
    images = [];
    labels = [];
  };
  for (const message of messages) {
    if (message.role !== 'tool') flush();
    if (message.role === 'tool' && message.images?.length) {
      result.push({ ...message, images: undefined });
      images.push(...message.images);
      labels.push(message.content);
    } else result.push(message);
  }
  flush();
  return result;
}
