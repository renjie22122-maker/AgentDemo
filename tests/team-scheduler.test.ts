import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { TaskBoard } from '../server/services/task-board.js';
import { TeamScheduler } from '../server/services/team-scheduler.js';
function fixture() {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'scheduler-')), 'db.sqlite'));
  const lead = {
    id: 'lead',
    conversationId: 'lead',
    parentRunId: null,
    status: 'running',
    createdAt: 0,
    depth: 0,
  } as any;
  for (const r of [
    lead,
    { ...lead, id: 'a', conversationId: 'a', parentRunId: 'lead', depth: 1 },
    { ...lead, id: 'b', conversationId: 'b', parentRunId: 'lead', depth: 1 },
  ]) {
    store.put('run', r);
    store.put('conversation', {
      id: r.conversationId,
      permission: 'read-only',
      teamStrategy: 'auto',
    });
  }
  return { store, lead, board: new TaskBoard(store), scheduler: new TeamScheduler(store) };
}
const task = (id: string, extra: any = {}) => ({
  id,
  title: id,
  acceptance: 'read result',
  dependsOn: [],
  ...extra,
});
test('automatic allocation balances ready tasks, respects capacity, priority and repeated dispatch', () => {
  const f = fixture();
  try {
    f.board.create(
      f.lead,
      [
        task('low'),
        task('high', { priority: 10 }),
        task('later', { dependsOn: ['high'] }),
        task('third'),
      ],
      0,
    );
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    const assignments = f.scheduler.dispatch(f.lead);
    assert.equal(assignments.length, 2);
    assert.equal(assignments[0].taskId, 'high');
    assert.equal(new Set(assignments.map((a) => a.runId)).size, 2);
    assert.equal(f.scheduler.dispatch(f.lead).length, 0);
    const worker = f.store.get<any>('run', assignments[0].runId);
    const evidence = f.store.event(worker.conversationId, worker.id, 'tool.completed', {
      name: 'read_file',
      output: 'yes',
    });
    f.board.update(worker, 'high', 2, 'done', [evidence.id], '');
    const next = f.scheduler.dispatch(worker);
    assert.equal(next.length, 1);
    assert.equal(next[0].taskId, 'later');
    assert.equal(next[0].runId, worker.id);
  } finally {
    f.store.close();
  }
});
test('unknown effects, approvals, recovery, foreign workers and disabled team cannot receive work', () => {
  const f = fixture();
  try {
    f.board.create(f.lead, [task('one'), task('two')], 0);
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    f.store.put('run', { ...f.store.get<any>('run', 'a'), status: 'waiting_approval' });
    const effect = f.store.beginEffect('b', 'run_command', {});
    assert.equal(f.scheduler.dispatch(f.lead).length, 0);
    f.store.endEffect(effect, 'confirmed');
    f.store.put('run', { ...f.store.get<any>('run', 'b'), recoveryOnly: true });
    assert.equal(f.scheduler.dispatch(f.lead).length, 0);
    assert.throws(
      () => f.scheduler.configure(f.store.get<any>('run', 'a'), ['b'], 1, true),
      /lead/,
    );
    f.store.put('conversation', { id: 'lead', teamStrategy: 'off' });
    assert.throws(() => f.scheduler.configure(f.lead, ['a'], 1, true), /disabled/);
  } finally {
    f.store.close();
  }
});
test('write work requires writable isolated member; blocked tasks never auto-replayed', () => {
  const f = fixture();
  try {
    f.board.create(f.lead, [task('write', { execution: 'isolated' }), task('blocked')], 0);
    f.board.update(f.lead, 'blocked', 1, 'blocked', [], 'uncertain operation');
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    assert.equal(f.scheduler.dispatch(f.lead).length, 0);
    f.store.put('conversation', {
      id: 'b',
      permission: 'ask',
      isolationId: 'copy',
      teamStrategy: 'auto',
    });
    f.store.put('isolation', { id: 'copy', state: 'ready' });
    const assigned = f.scheduler.dispatch(f.lead);
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].runId, 'b');
    assert.equal(assigned[0].taskId, 'write');
  } finally {
    f.store.close();
  }
});

test('merged copy is never dispatched and overweight task has an explicit diagnostic', () => {
  const f = fixture();
  try {
    f.store.put('conversation', {
      id: 'b',
      permission: 'ask',
      isolationId: 'copy',
      teamStrategy: 'auto',
    });
    f.store.put('isolation', { id: 'copy', state: 'merged' });
    f.board.create(
      f.lead,
      [task('write', { execution: 'isolated' }), task('heavy', { weight: 8 })],
      0,
    );
    f.scheduler.configure(f.lead, ['b'], 1, true);
    assert.equal(f.scheduler.dispatch(f.lead).length, 0);
    assert.equal(f.store.get<any>('team-scheduler-diagnostics', 'lead').blocked[0].taskId, 'heavy');
  } finally {
    f.store.close();
  }
});
