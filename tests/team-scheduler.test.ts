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
      permission: r.id === 'lead' ? 'ask' : 'read-only',
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

test('contract graph derives schema/API/UI/integration dependencies and rejects ambiguity/cycles', () => {
  const f = fixture();
  try {
    f.board.create(
      f.lead,
      [
        task('schema', { provides: ['schema-v1'] }),
        task('api', { requires: ['schema-v1'], provides: ['api-v1'] }),
        task('ui', { provides: ['ui-v1'] }),
        task('integration', { requires: ['schema-v1', 'api-v1', 'ui-v1'] }),
      ],
      0,
    );
    assert.deepEqual(f.board.get(f.lead).tasks.find((t) => t.id === 'api')!.dependsOn, ['schema']);
    assert.deepEqual(f.board.get(f.lead).tasks.find((t) => t.id === 'integration')!.dependsOn, [
      'schema',
      'api',
      'ui',
    ]);
  } finally {
    f.store.close();
  }
  const g = fixture();
  try {
    assert.throws(
      () => g.board.create(g.lead, [task('x', { requires: ['missing'] })], 0),
      /producer/,
    );
    assert.throws(
      () =>
        g.board.create(
          g.lead,
          [
            task('x', { provides: ['x'], requires: ['y'] }),
            task('y', { provides: ['y'], requires: ['x'] }),
          ],
          0,
        ),
      /DAG/,
    );
    assert.equal(g.board.get(g.lead).tasks.length, 0);
  } finally {
    g.store.close();
  }
});
test('specialization affects routing but never grants isolation permissions', () => {
  const f = fixture();
  try {
    f.board.create(f.lead, [task('api', { skills: ['api'] })], 0);
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true, [
      { runId: 'a', skills: ['ui'], paths: [] },
      { runId: 'b', skills: ['api'], paths: [] },
    ]);
    const picked = f.scheduler.dispatch(f.lead);
    assert.equal(picked[0].runId, 'b');
    assert.ok(picked[0].routing);
    assert.throws(
      () =>
        f.scheduler.configure(f.lead, ['a'], 1, true, [
          { runId: 'foreign', skills: ['api'], paths: [] },
        ]),
      /enrolled/,
    );
  } finally {
    f.store.close();
  }
  const g = fixture();
  try {
    g.board.create(
      g.lead,
      [task('write', { execution: 'isolated', skills: ['api'], writePaths: ['src/api'] })],
      0,
    );
    g.scheduler.configure(g.lead, ['a'], 1, true, [
      { runId: 'a', skills: ['api'], paths: ['src/api'] },
    ]);
    assert.equal(g.scheduler.dispatch(g.lead).length, 0);
  } finally {
    g.store.close();
  }
});
test('overlapping writes wait', () => {
  const f = fixture();
  try {
    for (const id of ['a', 'b']) {
      f.store.put('conversation', {
        id,
        permission: 'ask',
        isolationId: 'copy-' + id,
        teamStrategy: 'auto',
      });
      f.store.put('isolation', { id: 'copy-' + id, state: 'ready' });
    }
    f.board.create(
      f.lead,
      [
        task('one', { execution: 'isolated', writePaths: ['src/api'] }),
        task('two', { execution: 'isolated', writePaths: ['src/api/routes.ts'] }),
      ],
      0,
    );
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    assert.equal(f.scheduler.dispatch(f.lead).length, 1);
    assert.match(
      f.store.get<any>('team-scheduler-diagnostics', 'lead').blocked[0].reason,
      /overlaps/,
    );
  } finally {
    f.store.close();
  }
});

test('independent writable paths can be assigned concurrently', () => {
  const f = fixture();
  try {
    for (const id of ['a', 'b']) {
      f.store.put('conversation', {
        id,
        permission: 'ask',
        isolationId: 'copy-' + id,
        teamStrategy: 'auto',
      });
      f.store.put('isolation', { id: 'copy-' + id, state: 'ready' });
    }
    f.board.create(
      f.lead,
      [
        task('one', { execution: 'isolated', writePaths: ['src/api'] }),
        task('two', { execution: 'isolated', writePaths: ['src/ui'] }),
      ],
      0,
    );
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    assert.equal(f.scheduler.dispatch(f.lead).length, 2);
  } finally {
    f.store.close();
  }
});

test('read-only planner cannot create runnable write work', () => {
  const f = fixture();
  try {
    f.store.put('conversation', { id: 'lead', permission: 'read-only', teamStrategy: 'auto' });
    assert.throws(
      () => f.board.create(f.lead, [task('write', { execution: 'isolated' })], 0),
      /read-only/,
    );
    assert.equal(f.board.get(f.lead).revision, 0);
  } finally {
    f.store.close();
  }
});
