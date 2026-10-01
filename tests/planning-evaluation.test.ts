import test from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../evals/planning/cases.js';
import { gradePlan } from '../evals/planning/grade.js';
import { validateTaskGraph } from '../server/services/task-graph.js';
const truth = (c: (typeof cases)[number]) =>
  c.tasks.map((id) => ({
    id,
    title: id,
    acceptance: 'Observable outcome',
    execution: 'read-only',
    dependsOn: c.edges.filter((e) => e[1] === id).map((e) => e[0]),
  }));
test('planning evaluator accepts all reference DAGs, detects missing edges and excessive serialization', () => {
  assert.equal(cases.length, 15);
  assert.equal(cases.filter((c) => c.split === 'holdout').length, 10);
  for (const c of cases) assert.equal(gradePlan(c, truth(c)).pass, true, c.id);
  const c = cases[0],
    missing = truth(c);
  missing.find((t) => t.id === 'api')!.dependsOn = [];
  assert.equal(gradePlan(c, missing).pass, false);
  const serialized = truth(c);
  serialized.find((t) => t.id === 'frontend')!.dependsOn = ['api'];
  assert.equal(gradePlan(c, serialized).pass, false);
  const redundant = truth(c);
  redundant.find((t) => t.id === 'integration')!.dependsOn = ['api', 'frontend'];
  assert.equal(gradePlan(c, redundant).pass, true);
});
test('planning evaluator rejects scope expansion, malformed graphs and write tasks in read-only plans', () => {
  const c = cases.find((c) => c.readOnly)!;
  const tasks = truth(c);
  assert.equal(gradePlan(c, [...tasks, { ...tasks[0], id: 'extra' }]).pass, false);
  assert.equal(gradePlan(c, tasks.slice(1)).pass, false);
  assert.equal(
    gradePlan(
      c,
      tasks.map((t, i) => (i ? t : { ...t, execution: 'isolated', writePaths: ['x'] })),
    ).pass,
    false,
  );
  assert.equal(gradePlan(c, [{ id: 'bad' }]).pass, false);
  assert.throws(() => validateTaskGraph([{ id: 'x', dependsOn: ['x'] }]), /DAG/);
  assert.throws(
    () => validateTaskGraph([{ id: 'x', dependsOn: [], requires: ['missing'] }]),
    /producer/,
  );
  assert.throws(
    () => validateTaskGraph([{ id: 'x', dependsOn: [], execution: 'isolated' }], true),
    /read-only/,
  );
});

test('existing inputs are not fake tasks; ambiguous source claims cannot erase a producer edge', () => {
  const tasks = validateTaskGraph([
    {
      id: 'x',
      dependsOn: [],
      requires: ['spec'],
      externalInputs: [{ name: 'spec', source: 'User supplied frozen specification' }],
    },
  ]);
  assert.deepEqual(tasks[0].dependsOn, []);
  assert.throws(
    () =>
      validateTaskGraph([
        { id: 'p', dependsOn: [], provides: ['spec'] },
        {
          id: 'x',
          dependsOn: [],
          requires: ['spec'],
          externalInputs: [{ name: 'spec', source: 'user' }],
        },
      ]),
    /producer/,
  );
});

test('report summary distinguishes local grading failure from unavailable API usage', async () => {
  const { summarizePlanning } = await import('../evals/planning/report.js');
  const prices = { input: 1, output: 2, cached: 0.1 };
  const rows = [
    {
      arm: 'baseline',
      split: 'holdout',
      pass: false,
      error: 'invalid contract',
      elapsedMs: 1,
      attempts: [{ usage: { input: 100, output: 20, cached: 50, measured: true } }],
    },
  ];
  const known = summarizePlanning(rows, prices)[0];
  assert.equal(known.usageIncomplete, false);
  assert.equal(known.estimatedUsd, 0.000095);
  assert.equal(
    summarizePlanning([{ ...rows[0], usageIncomplete: true }], prices)[0].estimatedUsd,
    null,
  );
  assert.equal(
    summarizePlanning(rows, { input: null, output: null, cached: null })[0].estimatedUsd,
    null,
  );
});
