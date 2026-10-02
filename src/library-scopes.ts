import type { Conversation, Run } from '../shared/types';
// A fork has parentId too: only delegated runs identify internal worker chats.
export function libraryConversations(conversations: Conversation[], runs: Run[]) {
  const workers = new Set(runs.filter((r) => !!r.parentRunId).map((r) => r.conversationId));
  return conversations.filter((c) => !c.archived && !workers.has(c.id));
}
