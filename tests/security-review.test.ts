import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSecurityReview, securitySurfaces } from '../server/services/security-review.js';
import { Store } from '../server/storage/store.js';
import { TaskBoard } from '../server/services/task-board.js';
import { TaskChallenges } from '../server/services/task-challenges.js';
import { FileScope } from '../server/services/paths.js';
import { Verification, stamp } from '../server/services/verification.js';
import { finalizeRun } from '../server/core/finalization.js';
test('security design covers boundaries with positive controls, without inventing passes', () => {
  const r = prepareSecurityReview([...securitySurfaces, 'authorization']);
  assert.equal(r.checks.length, 7);
  assert.equal(r.status, 'not-tested');
  assert.equal(r.calibratedConfidence, null);
  for (const c of r.checks) {
    assert(c.attacks.length);
    assert(c.controls.length);
    assert.deepEqual(c.evidence, []);
    assert.equal(c.status, 'not-tested');
  }
  assert.match(
    r.checks.find((c) => c.surface === 'authorization')!.attacks.join(' '),
    /second real account/,
  );
  assert.match(
    r.checks.find((c) => c.surface === 'external-events')!.attacks.join(' '),
    /simulation/,
  );
});
test('unresolved concerns block delivery; prior green tests cannot resolve them and changes reopen them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-gate-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null, status: 'running' } as any;
  const other = { id: 'o', conversationId: 'o', parentRunId: null } as any;
  store.put('run', run);
  store.put('run', other);
  store.put('conversation', { id: 'c', permission: 'ask' });
  const board = new TaskBoard(store),
    files = new FileScope([dir]),
    challenges = new TaskChallenges(store),
    verify = new Verification(store);
  try {
    writeFileSync(join(dir, 'code.txt'), 'v1');
    board.create(
      run,
      [
        {
          id: 'a',
          title: 'protected operation',
          acceptance: 'deny other actors',
          dependsOn: [],
          artifacts: ['code.txt'],
        },
      ],
      0,
    );
    const snapshot = await stamp(files, ['code.txt']);
    const check = () =>
      store.event('c', 'r', 'tool.completed', {
        name: 'read_file',
        output: 'observed',
        verification: {
          before: snapshot,
          after: snapshot,
          passed: true,
          checkedPaths: ['code.txt'],
        },
      });
    const old = check();
    board.update(run, 'a', 1, 'done', [old.id], '');
    await verify.record(run, files, 'a', 2, old.id);
    const c = challenges.raise(
      run,
      'a',
      board.get(run).revision,
      'foreign actor may access object',
      'Call operation with another account and object ID',
    );
    assert.equal(challenges.list(other).length, 0);
    await assert.rejects(finalizeRun(store, run, files), /Unresolved task challenges/);
    await assert.rejects(
      challenges.resolve(run, files, c.id, 1, old.id, 'old green suite'),
      /after this challenge/,
    );
    const fresh = check();
    board.update(run, 'a', board.get(run).revision, 'done', [fresh.id], '');
    await verify.record(run, files, 'a', board.get(run).revision, fresh.id);
    const resolved = await challenges.resolve(
      run,
      files,
      c.id,
      1,
      fresh.id,
      'Static check of relevant guard; execution not claimed',
    );
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.resolution?.independent, false);
    writeFileSync(join(dir, 'code.txt'), 'v2');
    await verify.refresh(run, files);
    assert.equal(challenges.list(run)[0].status, 'open');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('review scaffolding cannot count as completion evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-evidence-')),
    store = new Store(join(dir, 'db.sqlite'));
  const run = { id: 'r', conversationId: 'c', parentRunId: null } as any;
  store.put('run', run);
  store.put('conversation', { id: 'c', permission: 'ask' });
  const board = new TaskBoard(store);
  try {
    board.create(run, [{ id: 'a', title: 'check', acceptance: 'actual test', dependsOn: [] }], 0);
    for (const name of [
      'prepare_security_review',
      'record_task_challenge',
      'resolve_task_challenge',
    ]) {
      const event = store.event('c', 'r', 'tool.completed', { name, output: 'ok' });
      assert.throws(
        () => board.update(run, 'a', 1, 'done', [event.id], ''),
        /not completion evidence/,
      );
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('host triggers review from declared risks or code without a user review request', async () => {
  const { automaticSecurityReview } = await import('../server/services/security-review.js');
  const base = {
    id: 'a',
    title: 'Implement service',
    acceptance: 'support callback and enforce ownership',
    artifacts: ['api.ts'],
  } as any;
  const review = automaticSecurityReview([base])!;
  assert.equal(review.trigger, 'host-declared-task-policy');
  assert(review.checks.some((c) => c.surface === 'authorization'));
  assert(review.checks.some((c) => c.surface === 'external-events'));
  assert(
    automaticSecurityReview([{ ...base, title: '修改程序', acceptance: '实现功能' }])!.checks.some(
      (c) => c.surface === 'untrusted-input',
    ),
  );
  assert.equal(
    automaticSecurityReview([
      { ...base, title: '写故事', acceptance: '三章', artifacts: ['story.md'] },
    ]),
    undefined,
  );
});
