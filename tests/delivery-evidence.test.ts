import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { TaskBoard } from '../server/services/task-board.js';
import { deliveryEvidence } from '../server/services/delivery-evidence.js';
import { FileScope } from '../server/services/paths.js';
import { Verification, stamp } from '../server/services/verification.js';
import { finalizeRun } from '../server/core/finalization.js';

test('delivery projection distinguishes no assessment, blockers, and unverified completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delivery-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null, status: 'running' } as any;
  store.put('run', run);
  store.put('conversation', { id: 'c', permission: 'ask' });
  try {
    assert.equal(deliveryEvidence(store, run).verdict, 'unassessed');
    const board = new TaskBoard(store);
    board.create(
      run,
      [
        {
          id: 'a',
          title: 'work',
          acceptance: 'behavior holds',
          dependsOn: [],
          artifacts: ['a.txt'],
        },
      ],
      0,
    );
    assert.equal(deliveryEvidence(store, run).verdict, 'red');
    await assert.rejects(finalizeRun(store, run, new FileScope([dir])), /unfinished tasks/);
    const event = store.event('c', 'r', 'tool.completed', {
      name: 'read_file',
      output: 'observed',
    });
    board.update(run, 'a', 1, 'done', [event.id], '');
    const report = deliveryEvidence(store, run);
    assert.equal(report.verdict, 'yellow');
    assert.equal(report.impact[0].coverage, 'unknown');
    assert.deepEqual(report.blockers.tasks, []);
    assert.match(report.limitations, /no complete semantic impact/);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('current artifact observation stays distinct from declared downstream verification and stale checks block', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delivery-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null, status: 'running' } as any;
  store.put('run', run);
  store.put('conversation', { id: 'c', permission: 'ask' });
  try {
    writeFileSync(join(dir, 'a.txt'), 'v1');
    const board = new TaskBoard(store),
      files = new FileScope([dir]),
      verify = new Verification(store);
    board.create(
      run,
      [
        {
          id: 'a',
          kind: 'implement',
          title: 'implementation',
          acceptance: 'behavior holds',
          dependsOn: [],
          artifacts: ['a.txt'],
        },
        {
          id: 'v',
          kind: 'verify',
          title: 'check behavior',
          acceptance: 'counterexample rejected',
          dependsOn: ['a'],
          artifacts: ['a.txt'],
        },
      ],
      0,
    );
    const snapshot = await stamp(files, ['a.txt']);
    const event = store.event('c', 'r', 'tool.completed', {
      name: 'read_file',
      output: 'observed',
      verification: { before: snapshot, after: snapshot, passed: true, checkedPaths: ['a.txt'] },
    });
    board.update(run, 'a', board.get(run).revision, 'done', [event.id], '');
    await verify.record(run, files, 'a', board.get(run).revision, event.id);
    assert.equal(deliveryEvidence(store, run).impact[0].coverage, 'artifact-check-only');
    board.update(run, 'v', board.get(run).revision, 'done', [event.id], '');
    await verify.record(run, files, 'v', board.get(run).revision, event.id);
    assert.equal(deliveryEvidence(store, run).impact[0].coverage, 'declared-successor-checked');
    writeFileSync(join(dir, 'a.txt'), 'v2');
    await verify.refresh(run, files);
    assert.equal(deliveryEvidence(store, run).verdict, 'red');
    assert.ok(deliveryEvidence(store, run).blockers.tasks.includes('a'));
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
