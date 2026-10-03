import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../evals/coding/grading.js';
import { cases } from '../evals/coding/cases.js';
import { withoutReadReuse } from '../evals/coding/adapter.js';
test('coding pilot grader validates all references and rejects all wrong implementations', async () => {
  for (const c of cases) {
    assert.equal((await grade(c.reference, c.checks)).passed, true, c.id);
    assert.equal((await grade('module.exports=()=>null', c.checks)).passed, false, c.id);
  }
});
test('coding pilot grader bounds nonterminating submissions', async () => {
  assert.equal(
    (await grade('module.exports=()=>{while(true){}}', [{ input: 0, output: 0 }])).passed,
    false,
  );
});
test('read reuse ablation restores real outputs and fails closed on missing provenance', () => {
  const messages = [
    { role: 'tool' as const, callId: 'b', content: 'reference', contextSourceCallId: 'a' },
  ];
  assert.deepEqual(withoutReadReuse(messages, new Map([['b', 'original']])), {
    messages: [{ role: 'tool', callId: 'b', content: 'original' }],
    restored: 1,
  });
  assert.throws(() => withoutReadReuse(messages, new Map()));
  assert.equal(messages[0].content, 'reference');
});

test('coding grader rejects mutation even when the returned value is correct', async () => {
  assert.equal(
    (await grade('module.exports=a=>{a.push(99);return 1}', [{ input: [], output: 1 }])).passed,
    false,
  );
});
