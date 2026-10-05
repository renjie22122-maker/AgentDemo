import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreviewResult } from '../src/preview-results.js';
import { previewDocument } from '../src/markdown-rich.js';

test('preview results accept generic text and structured data without evaluating content', () => {
  assert.deepEqual(parsePreviewResult({ title: 'Experiment', data: { samples: [1, 2] } }), {
    title: 'Experiment',
    text: JSON.stringify({ samples: [1, 2] }, null, 2),
  });
  assert.equal(parsePreviewResult('<script>alert(1)</script>')?.text, '<script>alert(1)</script>');
  for (const value of [
    null,
    '',
    [],
    { title: 5, text: 'x' },
    { text: 'x'.repeat(16001) },
    { data: BigInt(2) },
  ])
    assert.equal(parsePreviewResult(value), null);
  const cycle: any = {};
  cycle.self = cycle;
  assert.equal(parsePreviewResult({ data: cycle }), null);
});

test('preview bridge is optional and cannot inject arbitrary token source', () => {
  const isolated = previewDocument('<p>Example</p>');
  assert.ok(!isolated.includes('submitResult'));
  const bridged = previewDocument('<p>Example</p>', 'valid-token-123');
  assert.ok(bridged.includes('submitResult'));
  assert.ok(bridged.includes("connect-src 'none'"));
  assert.ok(bridged.includes("form-action 'none'"));
  assert.ok(!previewDocument('ok', '</script><script>evil()').includes('submitResult'));
});
