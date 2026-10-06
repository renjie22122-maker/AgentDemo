import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedRuns, relationTree, communicationEdges } from '../src/team-relations.js';
import { graphLayout } from '../src/components/RelationGraph.js';
const runs = [
  { id: 'old', conversationId: 'chat', parentRunId: null },
  { id: 'child', conversationId: 'c', parentRunId: 'old' },
  { id: 'grand', conversationId: 'g', parentRunId: 'child' },
  { id: 'new', conversationId: 'chat', parentRunId: null },
  { id: 'foreign', conversationId: 'f', parentRunId: null },
] as any;
test('old round descendants remain distinct from a newer round and unrelated runs', () => {
  assert.deepEqual(
    relatedRuns(runs, ['old']).map((r) => r.id),
    ['old', 'child', 'grand'],
  );
  assert.deepEqual(
    relatedRuns(runs, ['new']).map((r) => r.id),
    ['new'],
  );
  assert.deepEqual(
    relationTree(relatedRuns(runs, ['old'])).map((r) => r.level),
    [0, 1, 2],
  );
  const cycle = [
    { id: 'a', parentRunId: 'b' },
    { id: 'b', parentRunId: 'a' },
  ] as any;
  assert.equal(relationTree(cycle).length, 2);
  assert.equal(relatedRuns(cycle, ['a']).length, 2);
});
test('communication graph deduplicates actual submissions and rejects unrelated or inferred text', () => {
  const event = {
    id: 1,
    type: 'agent.message.submitted',
    data: { sender: 'child', recipient: 'grand' },
    createdAt: 2,
  };
  const edges = communicationEdges(
    relatedRuns(runs, ['old']),
    [
      event,
      event,
      {
        id: 2,
        type: 'assistant.message',
        data: { sender: 'child', recipient: 'grand' },
        createdAt: 3,
      },
      {
        id: 3,
        type: 'agent.message.submitted',
        data: { sender: 'foreign', recipient: 'child' },
        createdAt: 3,
      },
    ] as any,
    [
      {
        id: 'd',
        sender: 'old',
        recipients: ['child', 'grand', 'foreign'],
        text: 'discussion',
        at: 4,
      },
    ],
  );
  assert.equal(edges.length, 3);
  assert.equal(edges.find((e) => e.kind === 'direct')?.count, 1);
  assert.ok(edges.every((e) => e.from !== 'foreign' && e.to !== 'foreign'));
});
test('dependency layout reflects prerequisite direction and remains finite with cycles', () => {
  const nodes = ['a', 'b', 'c'].map((id) => ({ id, label: id, subtitle: '' }));
  const layout = graphLayout(nodes, [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ]);
  assert.ok(layout[0].y < layout[1].y && layout[1].y < layout[2].y);
  assert.equal(
    graphLayout(nodes, [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]).length,
    3,
  );
});
