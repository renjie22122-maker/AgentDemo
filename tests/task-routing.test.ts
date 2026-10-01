import test from 'node:test';
import assert from 'node:assert/strict';
import { pathOverlap, routingScore, resourceConflict } from '../server/services/task-routing.js';
import type { BoardTask } from '../server/services/task-board.js';
const task = (extra: Partial<BoardTask> = {}): BoardTask => ({
  id: 'x',
  title: 'API',
  acceptance: 'Test API',
  dependsOn: [],
  owner: null,
  status: 'pending',
  evidence: [],
  note: '',
  skills: ['API'],
  ...extra,
});
test('routing history ignores unverified claims and penalizes blocked relevant work', () => {
  const target = task(),
    base = routingScore(target, undefined, [], 0);
  const unverified = routingScore(target, undefined, [task({ status: 'done' })], 0);
  assert.equal(unverified.score, base.score);
  const checked = task({
    status: 'done',
    skills: ['api'],
    verification: { status: 'checked' } as any,
  });
  assert.ok(routingScore(target, undefined, [checked], 0).score > base.score);
  assert.ok(routingScore(target, undefined, [task({ status: 'blocked' })], 0).score < base.score);
  assert.equal(
    routingScore(target, undefined, [task({ status: 'blocked', skills: ['ui'] })], 0).score,
    base.score,
  );
});
test('path conflicts include normalized aliases, ancestor directories and reader/writer overlap', () => {
  assert.equal(pathOverlap('src/a/../api', 'src/api/index.ts'), true);
  assert.equal(pathOverlap('@0/src/api', 'src\\api'), true);
  assert.equal(pathOverlap('src/api', 'src/apis'), false);
  assert.equal(
    resourceConflict(
      task({ execution: 'isolated', writePaths: ['src/api'] }),
      task({ readPaths: ['src/api/index.ts'] }),
    ),
    true,
  );
  assert.equal(
    resourceConflict(task({ readPaths: ['src/api'] }), task({ readPaths: ['src/api'] })),
    false,
  );
});
