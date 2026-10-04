import type { Profile } from '../../shared/types.js';
export function capabilityReport(p: Profile) {
  if (!p) throw new Error('Current model profile is unavailable.');
  const declared = (value: boolean) => ({
    state: value ? 'declared' : 'not-configured',
    verified: false,
  });
  return {
    model: p.model,
    transport: p.transport,
    capabilities: {
      vision: declared(p.vision),
      reasoning: declared(p.reasoningFormat !== 'none'),
      toolCalling: { state: 'adapter-supported', verified: false },
      parallelToolCalls: { state: 'unknown', verified: false },
      structuredOutput: { state: 'unknown', verified: false },
      nativeToolSearch: { state: 'not-integrated', verified: false },
      nativeComputerUse: { state: 'not-integrated', verified: false },
      promptCache: { state: 'provider-dependent', verified: false },
    },
    contextWindow: { value: p.contextWindow, source: 'configuration' },
    maxOutputTokens: { value: p.maxOutputTokens, source: 'configuration' },
    note: 'Adapter support and user configuration are not a successful endpoint probe. No credentials included.',
  };
}
