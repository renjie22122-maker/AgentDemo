import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { MemoryIndex } from '../server/services/memory-index.js';
test('general and project memory scopes stay separate; project may opt into user preferences', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-scope-')),
    store = new Store(join(dir, 'db.sqlite'));
  const sent: string[][] = [];
  const embedding = {
    enabled: () => false,
    fingerprint: () => 'fixture',
    encode: async (texts: string[]) => {
      sent.push(texts);
      return texts.map(() => [1, 0]);
    },
  };
  const index = new MemoryIndex(store, embedding as any),
    signal = new AbortController().signal;
  try {
    for (const [id, scope, active] of [
      ['user', 'user', true],
      ['a', 'project:a', true],
      ['b', 'project:b', true],
      ['candidate', 'user', false],
    ] as const)
      store.put('memory', {
        id,
        scope,
        active,
        content: 'TypeScript preference ' + id,
        revision: 1,
        createdAt: Date.now(),
        source: 'fixture',
        expiresAt: null,
      });
    assert.deepEqual(
      (await index.recall('TypeScript', null, signal)).memories.map((m) => m.id),
      ['user'],
    );
    assert.deepEqual(
      (await index.recall('TypeScript', 'a', signal, false)).memories.map((m) => m.id),
      ['a'],
    );
    assert.deepEqual(
      new Set((await index.recall('TypeScript', 'a', signal, true)).memories.map((m) => m.id)),
      new Set(['user', 'a']),
    );
    await index.index('project:a');
    assert.equal(sent.length, 1);
    assert.match(sent[0][0], /preference a$/);
  } finally {
    store.close();
  }
});
