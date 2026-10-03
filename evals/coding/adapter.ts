import type { ModelMessage } from '../../shared/types.js';
export function withoutReadReuse(messages: ModelMessage[], outputs: Map<string, string>) {
  let restored = 0;
  const result = messages.map((m) => {
    if (m.role !== 'tool' || !m.contextSourceCallId || !m.callId) return m;
    const content = outputs.get(m.callId);
    if (content === undefined) throw Error('Missing full read output for ablation');
    restored++;
    const { contextSourceCallId: _a, contextPatch: _b, contextResultHash: _c, ...full } = m;
    return { ...full, content };
  });
  return { messages: result, restored };
}
