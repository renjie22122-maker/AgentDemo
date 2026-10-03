import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/storage/store.js';
import { Knowledge } from '../server/services/knowledge.js';
import { KnowledgeMaintenance } from '../server/services/knowledge-maintenance.js';

test('adding a source folder reuses existing parses and vectors; live progress reflects real work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-progress-'));
  const a = join(dir, 'a'),
    b = join(dir, 'b'),
    data = join(dir, 'data');
  for (const d of [a, b, data]) await mkdir(d);
  const store = new Store(join(data, 'db.sqlite'));
  let calls = 0,
    parses = 0;
  const phases: string[] = [];
  const embedding: any = {
    enabled: () => true,
    fingerprint: () => 'test',
    encode: async (t: string[]) => {
      calls += t.length;
      phases.push(store.get<any>('knowledge-watch', 'general').progress.phase);
      return t.map(() => [1, 0]);
    },
  };
  const knowledge = new Knowledge(store, embedding);
  const manager = new KnowledgeMaintenance(
    store,
    knowledge,
    embedding,
    data,
    undefined,
    async (path) => {
      parses++;
      const w = store.get<any>('knowledge-watch', 'general');
      assert.equal(w.progress.phase, 'parsing');
      assert.equal(w.progress.currentFile, path);
      return readFile(path, 'utf8');
    },
  );
  try {
    await writeFile(join(a, 'a.md'), 'First distinct source.');
    await writeFile(join(b, 'b.md'), 'Second unrelated source.');
    store.put('knowledge-watch', {
      id: 'general',
      enabled: true,
      paths: [a],
      target: 'test',
      revision: 1,
    });
    await manager.tick();
    assert.equal(parses, 1);
    assert.equal(calls, 1);
    store.put('knowledge-watch', {
      id: 'general',
      enabled: true,
      paths: [a, b],
      target: 'test',
      revision: 2,
    });
    await manager.tick();
    assert.equal(parses, 2);
    assert.equal(calls, 2);
    const w = store.get<any>('knowledge-watch', 'general');
    assert.equal(w.progress.phase, 'done');
    assert.equal(w.progress.total, 2);
    assert.equal(w.progress.imported, 1);
    assert.equal(w.progress.reused, 1);
    assert.ok(phases.every((x) => x === 'indexing'));
    await manager.tick();
    assert.equal(parses, 2);
    assert.equal(calls, 2);
  } finally {
    await manager.close();
    knowledge.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('batch indexes only its scope, reuses vectors and stops on destination changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knowledge-batch-'));
  const store = new Store(join(dir, 'db.sqlite'));
  let calls = 0,
    target = 'test';
  const embedding: any = {
    enabled: () => true,
    fingerprint: () => target,
    encode: async (t: string[]) => {
      calls += t.length;
      return t.map(() => [1, 0]);
    },
  };
  const knowledge = new Knowledge(store, embedding),
    manager = new KnowledgeMaintenance(store, knowledge, embedding, dir);
  try {
    const a: any = knowledge.import('general', 'a', 'General scoped document.');
    const b: any = knowledge.import('project:other', 'b', 'Private project source.');
    manager.queueIndex('general');
    await manager.tick();
    assert.equal(calls, 1);
    assert.equal(knowledge.indexStatus(a.id).status, 'indexed');
    assert.equal(knowledge.indexStatus(b.id).status, 'pending');
    manager.queueIndex('general');
    await manager.tick();
    assert.equal(calls, 1);
    manager.queueIndex('general');
    target = 'new-service';
    await manager.tick();
    assert.equal(calls, 1);
    assert.equal(store.get<any>('knowledge-batch', 'general').status, 'needs_attention');
    assert.equal(knowledge.indexStatus(a.id).status, 'pending');
  } finally {
    await manager.close();
    knowledge.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
