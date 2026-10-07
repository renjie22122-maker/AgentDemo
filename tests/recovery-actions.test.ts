import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { FileScope } from '../server/services/paths.js';
import { inspectRecovery } from '../server/services/recovery-actions.js';
import { initialCognitiveState } from '../server/core/cognitive-policy.js';
import { recoveryProposal } from '../server/core/recovery-planner.js';
import { TaskBoard } from '../server/services/task-board.js';
test('recovery inspection is bounded, run-local, deduplicated and never passing completion evidence', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-action-')),
    store = new Store(join(dir, 'db.sqlite'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const run = { id: 'r', conversationId: 'c', status: 'running', parentRunId: null } as any;
  store.put('run', run);
  store.put('conversation', { id: 'c', memory: false });
  const files = new FileScope([dir]);
  const proposal = {
    id: 'r',
    runId: 'r',
    proposalId: 'p1',
    step: 4,
    ...recoveryProposal('verify', [], 1),
  };
  store.put('recovery-proposal', proposal);
  store.put('cognitive-state', {
    ...initialCognitiveState(),
    id: 'r',
    step: 4,
    pendingAdvice: { step: 4, action: 'verify', digest: 'x', errors: 0 },
  });
  await assert.rejects(inspectRecovery(store, run, files, 'foreign', 0), /current proposal ID/);
  const [a, b] = await Promise.all([
    inspectRecovery(store, run, files, 'p1', 1),
    inspectRecovery(store, run, files, 'p1', 1),
  ]);
  assert.equal(a.status, 'inspected');
  assert.equal(a.resolved, false);
  assert.equal(b.reused, true);
  assert.equal(store.list('recovery-inspection').length, 1);
  const repeated = await inspectRecovery(store, run, files, 'p1', 1);
  assert.equal(repeated.status, 'inspected');
  assert.equal(repeated.reused, true);
  store.put('cognitive-state', {
    ...initialCognitiveState(),
    id: 'r',
    step: 10,
    pendingAdvice: { step: 4 },
  });
  await assert.rejects(inspectRecovery(store, run, files, 'p1', 0), /expired/);
  store.put('cognitive-state', {
    ...initialCognitiveState(),
    id: 'r',
    step: 4,
    pendingAdvice: { step: 4 },
  });
  store.put('recovery-proposal', {
    ...proposal,
    proposalId: 'p2',
    steps: [{ kind: 'request-scope-decision', requiresApproval: true }],
  });
  await assert.rejects(inspectRecovery(store, run, files, 'p2', 0), /normal task tools/);
  store.put('recovery-proposal', {
    ...proposal,
    proposalId: 'p3',
    steps: [{ kind: 'run_command', requiresApproval: false }],
  });
  await assert.rejects(inspectRecovery(store, run, files, 'p3', 0), /normal task tools/);
  const board = new TaskBoard(store);
  board.create(run, [{ id: 'task', title: 'work', acceptance: 'works', dependsOn: [] }], 0);
  const event = store.event('c', 'r', 'tool.completed', {
    name: 'inspect_recovery_step',
    output: JSON.stringify(a),
  });
  assert.throws(() => board.update(run, 'task', 1, 'done', [event.id], ''), /evidence/i);
});
