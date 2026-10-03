import { compressToolText } from '../server/core/context-reuse.js';
import { restoreDetachedReferences } from '../server/core/context-reuse.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeMessages, RUNTIME_FACTS, reuseToolText } from '../server/core/context-reuse.js';
import { ProgressMonitor } from './progress-policy-helper.js';
import type { ModelMessage, ToolCall } from '../shared/types.js';
test('volatile runtime facts preserve static prefix without losing current facts', () => {
  const a = runtimeMessages('policy' + RUNTIME_FACTS + '{"runId":"old","permission":"trusted"}');
  const b = runtimeMessages('policy' + RUNTIME_FACTS + '{"runId":"new","permission":"ask"}');
  assert.deepEqual(a[0], b[0]);
  assert.match(b[1].content, /"permission":"ask"/);
  assert.equal(b[1].role, 'user');
  assert.deepEqual(runtimeMessages('legacy'), [{ role: 'system', content: 'legacy' }]);
});
test('fresh duplicate reads reference only retained full results of same operation', () => {
  const call: ToolCall = { id: 'new', name: 'read_file', arguments: { path: 'a' } };
  const output = 'unique content '.repeat(200);
  const history: ModelMessage[] = [
    { role: 'assistant', content: '', calls: [{ ...call, id: 'original' }] },
    { role: 'tool', callId: 'original', content: output },
  ];
  assert.match(reuseToolText(history, call, output), /original/);
  assert.equal(reuseToolText([], call, output), output);
  assert.equal(reuseToolText(history, call, output + 'changed'), output + 'changed');
  assert.equal(reuseToolText(history, { ...call, name: 'run_command' }, output), output);
  assert.equal(reuseToolText(history, { ...call, arguments: { path: 'b' } }, output), output);
  assert.equal(reuseToolText(history, call, output, true), output);
  assert.equal(reuseToolText(history.slice(1), call, output), output);
});
test('stagnation warns before stopping and new user work resets intervention', () => {
  const monitor = new ProgressMonitor();
  for (let i = 0; i < 3; i++) assert.equal(monitor.intervene(['read'], ['same']), 'none');
  assert.equal(monitor.intervene(['read'], ['same']), 'warn');
  for (let i = 0; i < 3; i++) assert.equal(monitor.intervene(['read'], ['same']), 'none');
  assert.equal(monitor.intervene(['read'], ['same']), 'stop');
  monitor.reset();
  for (let i = 0; i < 12; i++) assert.equal(monitor.intervene(['read'], ['new' + i]), 'none');
});

test('compaction restores a detached short reference instead of silently losing its data', () => {
  const source: ModelMessage = { role: 'tool', callId: 'base', content: 'full evidence' };
  const reference: ModelMessage = {
    role: 'tool',
    callId: 'later',
    content: 'short reference',
    contextSourceCallId: 'base',
  };
  assert.equal(
    restoreDetachedReferences([reference], [source, reference])[0].content,
    'full evidence',
  );
  assert.deepEqual(restoreDetachedReferences([source, reference], [source, reference]), [
    source,
    reference,
  ]);
  assert.throws(() => restoreDetachedReferences([reference], []), /Missing retained/);
});

test('small fresh file changes produce verified deltas and compaction restores exact current text', () => {
  const original = Array.from({ length: 200 }, (_, i) => 'Line ' + i + ': retained content.').join(
    '\n',
  );
  const updated = original.replace('Line 87: retained content.', 'Line 87: new value 713.');
  const call: ToolCall = { id: 'new', name: 'read_file', arguments: { path: 'a', folder: 0 } };
  const history: ModelMessage[] = [
    {
      role: 'assistant',
      content: '',
      calls: [{ ...call, id: 'base', arguments: { folder: 0, path: 'a' } }],
    },
    { role: 'tool', callId: 'base', content: original },
  ];
  const reused = compressToolText(history, call, updated);
  assert.equal(reused.mode, 'delta');
  assert.ok(reused.content.length < updated.length / 2);
  const result: ModelMessage = {
    role: 'tool',
    callId: 'new',
    content: reused.content,
    contextSourceCallId: reused.sourceCallId,
    contextPatch: reused.patch,
    contextResultHash: reused.resultHash,
  };
  assert.equal(restoreDetachedReferences([result], [...history, result])[0].content, updated);
  assert.throws(
    () => restoreDetachedReferences([{ ...result, contextResultHash: 'wrong' }], history),
    /integrity/,
  );
  const deltaOnly = [{ role: 'assistant' as const, content: '', calls: [call] }, result];
  assert.equal(compressToolText(deltaOnly, { ...call, id: 'again' }, updated).mode, 'full');
  assert.equal(
    compressToolText(history, { ...call, arguments: { path: 'a', folder: 1 } }, updated).mode,
    'full',
  );
  assert.equal(compressToolText(history, call, 'other '.repeat(1000)).mode, 'full');
});
