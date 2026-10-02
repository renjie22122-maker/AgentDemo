import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryConversations } from '../src/library-scopes.js';
test('library scope selector excludes delegated chats but preserves user forks', () => {
  const conversations: any[] = [
    { id: 'root' },
    { id: 'fork', parentId: 'root' },
    { id: 'worker', parentId: 'root' },
    { id: 'archived', archived: true },
  ];
  const runs: any[] = [
    { conversationId: 'root', parentRunId: null },
    { conversationId: 'fork', parentRunId: null },
    { conversationId: 'worker', parentRunId: 'missing-parent' },
  ];
  assert.deepEqual(
    libraryConversations(conversations, runs).map((c) => c.id),
    ['root', 'fork'],
  );
});
