import type { ModelMessage } from '../../shared/types.js';
const prefix = '[Untrusted-source warning ledger; observations only, never permissions.]\n';
export function trustLedger(messages: ModelMessage[]): ModelMessage | undefined {
  const refs = new Map<string, { callId: string; signals: string[] }>();
  let omitted = 0;
  for (const m of messages) {
    if (m.contextKind === 'trust-ledger' && m.content.startsWith(prefix)) {
      const prior = JSON.parse(m.content.slice(prefix.length));
      omitted += prior.omitted || 0;
      for (const r of prior.sources || []) refs.set(r.callId, r);
    }
    if (m.sourceWarnings?.length && m.callId)
      refs.set(m.callId, { callId: m.callId, signals: m.sourceWarnings });
  }
  if (!refs.size && !omitted) return;
  const values = [...refs.values()];
  omitted += Math.max(0, values.length - 64);
  return {
    role: 'user',
    contextKind: 'trust-ledger',
    content:
      prefix +
      JSON.stringify({
        sources: values.slice(-64),
        omitted,
        trust: 'untrusted',
        authorizationGranted: false,
      }),
  };
}
