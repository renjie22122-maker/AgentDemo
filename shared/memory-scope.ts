import type { Memory } from './types.js';
export function memoryConversation(m: Memory) {
  return m.sourceConversationId || /^chat:(.+)#event:\d+$/.exec(m.source)?.[1];
}
export function memoryReach(m: Memory): 'conversation' | 'scope' {
  return (
    m.recallScope ||
    (m.kind === 'episode' || (m.scope === 'user' && m.kind === 'decision')
      ? 'conversation'
      : 'scope')
  );
}
export function memoryAccessible(m: Memory, conversationId?: string) {
  return (
    memoryReach(m) === 'scope' || (!!conversationId && memoryConversation(m) === conversationId)
  );
}
export function memoryPartition(m: Memory) {
  return memoryReach(m) === 'scope' ? 'scope' : 'conversation:' + (memoryConversation(m) || m.id);
}
