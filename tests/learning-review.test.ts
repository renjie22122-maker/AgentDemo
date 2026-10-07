import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { TaskBoard } from '../server/services/task-board.js';
import { FileScope } from '../server/services/paths.js';
import { Verification, stamp } from '../server/services/verification.js';
import {
  proposeExperience,
  compareContracts,
  learningOutcomes,
} from '../server/services/learning-review.js';
test('formation requires current ordered observations; candidates remain private and inactive', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lesson-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null, createdAt: 2 } as any;
  store.put('run', run);
  store.put('conversation', { id: 'c', memory: true, projectId: 'p' });
  const files = new FileScope([dir]),
    board = new TaskBoard(store);
  try {
    writeFileSync(join(dir, 'a.txt'), 'fixed');
    board.create(
      run,
      [
        {
          id: 'impl',
          kind: 'implement',
          title: 'Fix',
          acceptance: 'Handle inputs',
          dependsOn: [],
          artifacts: ['a.txt'],
        },
        {
          id: 'v',
          kind: 'verify',
          title: 'Boundary test',
          acceptance: 'reject invalid',
          dependsOn: ['impl'],
          artifacts: ['a.txt'],
        },
      ],
      0,
    );
    const failure = store.event('c', 'r', 'tool.completed', {
      outcome: { status: 'failed', executionStarted: true },
    });
    const snapshot = await stamp(files, ['a.txt']);
    const pass = store.event('c', 'r', 'tool.completed', {
      name: 'read_file',
      output: 'fixed',
      verification: { before: snapshot, after: snapshot, passed: true, checkedPaths: ['a.txt'] },
    });
    board.update(run, 'impl', 1, 'done', [pass.id], '');
    board.update(run, 'v', 2, 'done', [pass.id], '');
    await new Verification(store).record(run, files, 'v', 3, pass.id);
    const input = {
      failureEventId: failure.id,
      taskId: 'v',
      lesson: 'Check invalid inputs',
      conditions: 'When parsing an enum',
      expected: 'reject unknown',
      observed: 'accepted unknown',
      causeHypothesis: 'fallback may be permissive',
    };
    const m = await proposeExperience(store, run, files, input);
    assert.equal(m.active, false);
    assert.equal(m.status, 'candidate');
    assert.equal(m.scope, 'project:p');
    assert.equal(m.recallScope, 'conversation');
    assert.equal((await proposeExperience(store, run, files, input)).id, m.id);
    assert.equal(store.list('memory').length, 1);
    assert.equal(store.get<any>('experience-formation', m.id).causalClaim, false);
    const denied = store.event('c', 'r', 'tool.completed', {
      outcome: { status: 'denied', executionStarted: false },
    });
    await assert.rejects(
      proposeExperience(store, run, files, { ...input, failureEventId: denied.id }),
      /executed failure/,
    );
    const foreign = store.event('elsewhere', 'other', 'tool.completed', {
      outcome: { status: 'failed', executionStarted: true },
    });
    await assert.rejects(
      proposeExperience(store, run, files, { ...input, failureEventId: foreign.id }),
      /this run/,
    );
    writeFileSync(join(dir, 'a.txt'), 'changed');
    await assert.rejects(proposeExperience(store, run, files, input), /current verify task/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('contract comparison reports structural regressions without crossing conversations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contracts-')),
    store = new Store(join(dir, 'db.sqlite'));
  const old = { id: 'old', conversationId: 'c', parentRunId: null, createdAt: 1 } as any,
    newer = { ...old, id: 'new', createdAt: 2 };
  store.put('run', old);
  store.put('run', newer);
  store.put('conversation', { id: 'c', memory: true });
  const task = {
    id: 'a',
    title: 'A',
    acceptance: 'All inputs',
    dependsOn: [],
    status: 'done',
    owner: null,
    evidence: [],
    note: '',
  };
  store.put('task-board', { id: 'old', revision: 1, tasks: [task, { ...task, id: 'b' }] });
  store.put('task-board', {
    id: 'new',
    revision: 1,
    tasks: [
      { ...task, acceptance: 'Only common inputs' },
      { ...task, id: 'c' },
    ],
  });
  try {
    const result = compareContracts(store, newer, 'old');
    assert.equal(result.removed[0].id, 'b');
    assert.deepEqual(result.added, ['c']);
    assert.equal(result.changed[0].id, 'a');
    store.put('run', { ...old, id: 'foreign', conversationId: 'elsewhere' });
    assert.throws(() => compareContracts(store, newer, 'foreign'), /same conversation/);
    assert.equal(learningOutcomes(store, newer).causalImprovement, null);
    store.put('conversation', { id: 'c', memory: false });
    assert.deepEqual(learningOutcomes(store, newer), { enabled: false });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
