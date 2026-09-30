import type { Profile, Reasoning } from './types.js';
export function matchModel(profile: Profile, metadata: any): Profile {
  const supported: Reasoning[] = ['auto', 'none', 'low', 'medium', 'high', 'max'];
  const efforts: Reasoning[] | undefined = metadata.efforts?.length
    ? [
        ...new Set<Reasoning>([
          'auto',
          ...(metadata.thinkingToggle ? ['none' as const] : []),
          ...metadata.efforts.filter((e: any) => supported.includes(e)),
        ]),
      ]
    : undefined;
  const positive = (n: any) => Number.isInteger(n) && n > 0;
  const contextWindow = positive(metadata.contextWindow)
    ? metadata.contextWindow
    : profile.contextWindow;
  // A model ceiling is not a recommendation to generate that much on every request.
  const maxOutputTokens = positive(metadata.maxOutputTokens)
    ? Math.min(
        metadata.maxOutputTokens,
        contextWindow - 1024,
        Math.max(
          profile.maxOutputTokens,
          efforts?.some((e) => ['high', 'max'].includes(e)) ? 131072 : 8192,
        ),
      )
    : Math.min(profile.maxOutputTokens, contextWindow - 1024);
  return {
    ...profile,
    model: metadata.id,
    contextWindow,
    maxOutputTokens,
    ...(profile.model !== metadata.id
      ? { prices: { input: null, output: null, cached: null } }
      : {}),
    ...(maxOutputTokens > 8192 && efforts?.includes('max')
      ? { timeoutMs: Math.max(profile.timeoutMs, 300000) }
      : {}),
    ...(efforts
      ? { efforts, reasoning: efforts.includes(profile.reasoning) ? profile.reasoning : 'auto' }
      : {}),
    ...(typeof metadata.vision === 'boolean' ? { vision: metadata.vision } : {}),
    ...(metadata.reasoningFormat ? { reasoningFormat: metadata.reasoningFormat } : {}),
  };
}
