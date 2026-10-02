import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { compilePlan } from '../server/services/plan-compiler.js';
import {
  adaptiveRouting,
  startTaskMeasurement,
  finishTaskMeasurement,
} from '../server/services/routing-outcomes.js';
import { planningPolicy } from '../server/services/planning-policy.js';
function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'planning-routing-'));
  const store = new Store(join(dir, 'db.sqlite'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return store;
}
test('plan compiler infers interface dependencies, exposes layers and rejects unattached verification', () => {
  const plan = compilePlan([
    {
      id: 'schema',
      kind: 'implement',
      dependsOn: [],
      acceptance: 'migration works',
      provides: ['schema'],
      execution: 'isolated',
      writePaths: ['db'],
    },
    {
      id: 'api',
      kind: 'implement',
      dependsOn: [],
      acceptance: 'contract test',
      requires: ['schema'],
      provides: ['api'],
    },
    { id: 'frontend', kind: 'implement', dependsOn: [], acceptance: 'UI flow' },
    {
      id: 'integration',
      kind: 'verify',
      dependsOn: ['frontend'],
      acceptance: 'end-to-end',
      requires: ['api'],
    },
  ]);
  assert.deepEqual(plan.layers, [['schema', 'frontend'], ['api'], ['integration']]);
  assert.ok(plan.warnings.some((w) => w.includes('schema')));
  assert.throws(
    () => compilePlan([{ id: 'bad', kind: 'verify', dependsOn: [], acceptance: 'test' }]),
    /Verification tasks/,
  );
  assert.throws(
    () =>
      compilePlan([{ id: 'bad', execution: 'isolated', dependsOn: [], acceptance: 'write' }], true),
    /read-only/,
  );
});
test('planning policy leaves short answers alone and recommends coordination from actual operations', (t) => {
  const store = fixture(t);
  const run: any = { id: 'r', conversationId: 'c', parentRunId: null };
  store.put('run', run);
  store.put('conversation', { id: 'c' });
  assert.equal(planningPolicy(store, run).mode, 'direct');
  for (const path of ['a.ts', 'b.ts', 'c.ts'])
    store.event('c', 'r', 'tool.started', { name: 'edit_file', arguments: { path } });
  const value = planningPolicy(store, run);
  assert.equal(value.mode, 'plan-recommended');
  assert.equal(value.planningRequired, false);
});
test('empirical routing uses relevant checked history, excludes stale/cross-project and preserves cold start', (t) => {
  const store = fixture(t),
    now = Date.now();
  const run: any = { id: 'new', conversationId: 'c', providerFingerprint: 'same-model' };
  store.put('conversation', { id: 'c', projectId: 'p' });
  const task: any = { skills: ['typescript'] };
  const add = (n: number, scope = 'project:p', status = 'checked') => {
    const id = 'o' + n;
    store.put('routing-outcome', {
      id,
      boardId: id,
      taskId: 't',
      owner: 'old',
      scope,
      provider: 'same-model',
      skills: ['typescript'],
      attributable: true,
      finishedAt: now - 1,
      status,
      durationMs: 1000,
      estimatedUsd: 0.01,
      toolResults: { run_command: { ok: 1, failed: 0 } },
    });
    store.put('task-board', {
      id,
      tasks: [{ id: 't', status: 'done', attemptId: id, verification: { status: 'checked' } }],
    });
  };
  for (let i = 0; i < 4; i++) add(i);
  assert.equal(adaptiveRouting(store, run, task, now).adjustment, 0);
  add(4);
  let score = adaptiveRouting(store, run, task, now);
  assert.ok(score.adjustment > 0);
  assert.equal(score.samples, 5);
  add(5, 'project:other');
  add(6, 'project:p', 'awaiting_check');
  assert.equal(adaptiveRouting(store, run, task, now).samples, 5);
  store.put('task-board', {
    id: 'o0',
    tasks: [{ id: 't', status: 'done', attemptId: 'o0', verification: { status: 'stale' } }],
  });
  assert.equal(adaptiveRouting(store, run, task, now).adjustment, 0);
});
test('task timing and estimated cost are host-observed; concurrent attribution remains unknown', (t) => {
  const store = fixture(t),
    run: any = { id: 'r', conversationId: 'c', estimatedUsd: 0.2, providerFingerprint: 'm' };
  store.put('run', run);
  store.put('conversation', { id: 'c', projectId: 'p' });
  const task: any = { id: 'a', skills: ['code'] },
    board: any = { id: 'b', tasks: [task] };
  startTaskMeasurement(store, board, task, run, 1000);
  store.put('run', { ...run, estimatedUsd: 0.3 });
  store.event('c', 'r', 'tool.completed', { name: 'run_command', output: '{"code":0}' });
  finishTaskMeasurement(store, task, 'done', 2000);
  const value = store.get<any>('routing-outcome', task.attemptId);
  assert.equal(value.durationMs, 1000);
  assert.ok(Math.abs(value.estimatedUsd - 0.1) < 1e-9);
  assert.equal(value.status, 'awaiting_check');
  const a: any = { id: 'x' },
    b: any = { id: 'y' };
  startTaskMeasurement(store, board, a, run);
  startTaskMeasurement(store, board, b, run);
  finishTaskMeasurement(store, a, 'done');
  assert.equal(store.get<any>('routing-outcome', a.attemptId).estimatedUsd, null);
  assert.equal(store.get<any>('routing-outcome', b.attemptId).attributable, false);
});

test('scheduler consumes empirical feedback but never bypasses write isolation', async (t) => {
  const { TaskBoard } = await import('../server/services/task-board.js');
  const { TeamScheduler } = await import('../server/services/team-scheduler.js');
  const store = fixture(t),
    now = Date.now();
  const lead: any = {
    id: 'lead',
    conversationId: 'lead',
    parentRunId: null,
    status: 'running',
    createdAt: 0,
  };
  for (const r of [
    lead,
    { ...lead, id: 'a', conversationId: 'a', parentRunId: 'lead', providerFingerprint: 'model-a' },
    { ...lead, id: 'b', conversationId: 'b', parentRunId: 'lead', providerFingerprint: 'model-b' },
  ]) {
    store.put('run', r);
    store.put('conversation', {
      id: r.conversationId,
      projectId: 'p',
      permission: r.id === 'lead' ? 'ask' : 'read-only',
      teamStrategy: 'auto',
    });
  }
  for (let i = 0; i < 5; i++) {
    const id = 'past' + i;
    store.put('routing-outcome', {
      id,
      scope: 'project:p',
      provider: 'model-b',
      skills: ['code'],
      attributable: true,
      finishedAt: now - 1,
      status: 'checked',
      boardId: id,
      taskId: 't',
      durationMs: 500,
      estimatedUsd: 0.001,
      toolResults: { run_command: { ok: 1, failed: 0 } },
    });
    store.put('task-board', {
      id,
      tasks: [{ id: 't', attemptId: id, status: 'done', verification: { status: 'checked' } }],
    });
  }
  const board = new TaskBoard(store);
  board.create(
    lead,
    [
      {
        id: 'read',
        title: 'Read',
        acceptance: 'inspect file',
        dependsOn: [],
        skills: ['code'],
        execution: 'read-only',
      },
      {
        id: 'write',
        title: 'Write',
        acceptance: 'tests pass',
        dependsOn: [],
        skills: ['code'],
        execution: 'isolated',
        writePaths: ['src'],
      },
    ],
    0,
  );
  const scheduler = new TeamScheduler(store);
  scheduler.configure(lead, ['a', 'b'], 1, true);
  const assignments = scheduler.dispatch(lead);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].runId, 'b');
  assert.equal(assignments[0].taskId, 'read');
});
