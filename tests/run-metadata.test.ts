import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
test('run metadata excludes checkpoints and stays atomic through rollback, update, removal and reopen', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'metadata-')), 'db.sqlite');
  let store = new Store(path);
  const run: any = {
    id: 'r',
    conversationId: 'c',
    createdAt: 1,
    status: 'completed',
    checkpoints: [{ role: 'user', content: 'x'.repeat(1000000) }],
  };
  store.put('run', run);
  assert.equal(store.runMetadata('c')[0].checkpoints.length, 0);
  assert.equal(store.get<any>('run', 'r').checkpoints[0].content.length, 1000000);
  assert.throws(() =>
    store.transaction(() => {
      store.put('run', { ...run, status: 'failed' });
      throw Error('rollback');
    }),
  );
  assert.equal(store.runHeader('r').status, 'completed');
  store.put('run', { ...run, status: 'failed' });
  store.close();
  store = new Store(path);
  assert.equal(store.runHeader('r').status, 'failed');
  store.remove('run', 'r');
  assert.equal(store.runMetadata().length, 0);
  store.close();
});
