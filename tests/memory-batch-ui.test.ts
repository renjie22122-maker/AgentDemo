import test from 'node:test';
import assert from 'node:assert/strict';
import { submitMemoryBatch } from '../src/memory-batch.js';
test('unlimited selection is sent in ordered bounded chunks with accumulated progress', async () => {
  const items = Array.from({ length: 501 }, (_, i) => ({ id: String(i), revision: 1 }));
  const sizes: number[] = [],
    progress: number[] = [];
  const result = await submitMemoryBatch(
    items,
    async (chunk) => {
      sizes.push(chunk.length);
      return { outcomes: chunk.map((x) => ({ ...x, ok: true })), changed: chunk.length, failed: 0 };
    },
    (x) => progress.push(x.processed),
  );
  assert.deepEqual(sizes, [100, 100, 100, 100, 100, 1]);
  assert.equal(result.changed, 501);
  assert.equal(new Set(result.outcomes.map((x) => x.id)).size, 501);
  assert.deepEqual(progress, [100, 200, 300, 400, 500, 501]);
});
test('unknown request failure stops remaining chunks without automatic replay', async () => {
  let calls = 0,
    processed = 0;
  await assert.rejects(
    submitMemoryBatch(
      Array.from({ length: 350 }, (_, i) => i),
      async (chunk) => {
        calls++;
        if (calls === 2) throw Error('connection lost');
        return {
          outcomes: chunk.map((id) => ({ id: String(id), ok: true })),
          changed: chunk.length,
          failed: 0,
        };
      },
      (x) => (processed = x.processed),
    ),
    /connection lost/,
  );
  assert.equal(calls, 2);
  assert.equal(processed, 100);
});
