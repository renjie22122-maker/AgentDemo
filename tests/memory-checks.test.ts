import { finalizeRun } from '../server/core/finalization.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { MemoryChecks } from '../server/services/memory-checks.js';
import { FileScope } from '../server/services/paths.js';
test('experience obligations stay pending, scoped and revision-bound; applicability never promotes memory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-check-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null } as any;
  const conversation = { id: 'c', projectId: 'p', memory: true };
  store.put('run', run);
  store.put('conversation', conversation);
  const event = store.event('c', 'r', 'tool.completed', { verification: { passed: true } });
  const memory = {
    id: 'm',
    scope: 'project:p',
    kind: 'experience',
    active: true,
    status: 'active',
    revision: 1,
    createdAt: 1,
    content: 'Reject conflicting operation keys',
    conditions: 'Operations with replay keys',
    evidence: [{ conversationId: 'c', eventId: event.id }],
  } as any;
  store.put('memory', memory);
  const service = new MemoryChecks(store),
    files = new FileScope([dir]);
  try {
    assert.equal(service.register(run, [memory])[0].status, 'pending');
    service.register(run, [memory]);
    assert.equal(service.list(run).length, 1);
    await assert.rejects(finalizeRun(store, run, files), /experience checks remain pending/);
    await assert.rejects(
      service.resolve(run, files, service.list(run)[0].id, 'checked', 'history passed', 'missing'),
      /current artifact evidence/,
    );
    await service.resolve(
      run,
      files,
      service.list(run)[0].id,
      'not-applicable',
      'No replay-key operation in this task',
    );
    assert.equal(service.list(run)[0].status, 'not-applicable');
    assert.deepEqual(store.get('memory', 'm'), memory);
    store.put('conversation', { ...conversation, projectId: 'q' });
    assert.equal(service.list(run).length, 0);
    store.put('conversation', { ...conversation, memory: false });
    assert.equal(service.list(run).length, 0);
    store.put('conversation', conversation);
    store.put('memory', { ...memory, revision: 2 });
    assert.equal(service.list(run).length, 0);
    store.put('memory', { ...memory, status: 'candidate', active: false });
    assert.equal(service.register(run, [memory]).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
