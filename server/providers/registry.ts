import type { Profile, Reasoning } from '../../shared/types.js';
import { assert } from '../core/errors.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { ChatProvider } from './openai-chat.js';
import type { ModelProvider } from './protocol.js';
import { ResponsesProvider } from './responses.js';
const providers: Record<string, ModelProvider> = {
  'openai-chat': new ChatProvider(),
  anthropic: new AnthropicProvider(),
  'openai-responses': new ResponsesProvider(),
  gemini: new GeminiProvider(),
};
export const providerFor = (profile: Profile) => {
  const p = providers[profile.transport];
  assert(p, 'PROVIDER_UNAVAILABLE', 'Unknown provider.');
  return p;
};
export async function discoverModels(profile: Profile) {
  const base = profile.baseUrl
    .replace(/\/(chat\/completions|responses|messages)\/?$/, '')
    .replace(/\/$/, '');
  const headers: Record<string, string> =
    profile.transport === 'anthropic'
      ? { 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' }
      : profile.transport === 'gemini'
        ? { 'x-goog-api-key': profile.apiKey }
        : { Authorization: 'Bearer ' + profile.apiKey };
  const response = await fetch(base + '/models', { headers, signal: AbortSignal.timeout(20000) });
  assert(
    response.ok,
    'DISCOVERY_FAILED',
    'Model discovery returned HTTP ' +
      response.status +
      '. Enter model ID manually if this provider does not list models.',
    502,
  );
  const data = (await response.json()) as any;
  return (data.data || data.models || []).map((m: any) => ({
    id: m.id || m.name?.replace(/^models\//, ''),
    name: m.display_name || m.displayName || m.name || m.id,
    contextWindow: m.context_window ?? m.context_length ?? m.inputTokenLimit ?? null,
    maxOutputTokens: m.max_output_tokens ?? m.max_completion_tokens ?? m.outputTokenLimit ?? null,
    reasoningFormat:
      new URL(profile.baseUrl).hostname === 'api.deepseek.com'
        ? 'deepseek'
        : profile.reasoningFormat,
    efforts: (m.effort?.supported_levels ||
      m.supported_reasoning_efforts ||
      m.reasoning_efforts ||
      m.capabilities?.reasoning_efforts ||
      null) as Reasoning[] | null,
    vision: m.input_modalities?.includes('image') ?? null,
    thinkingToggle: new URL(profile.baseUrl).hostname === 'api.deepseek.com',
  }));
}
