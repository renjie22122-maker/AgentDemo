import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelPool } from '../server/core/pool.js';

test('model capacity and cancellation are isolated by conversation, including cleanup', async () => {
  const pool = new ModelPool(() => 1);
  const signal = new AbortController().signal;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const calls: string[] = [];
  const first = pool.run(
    signal,
    async () => {
      calls.push('a1');
      await gate;
    },
    'a',
  );
  const cancel = new AbortController();
  const cancelled = pool.run(
    cancel.signal,
    async () => {
      calls.push('cancelled');
    },
    'a',
  );
  const rejected = assert.rejects(cancelled);
  const second = pool.run(
    signal,
    async () => {
      calls.push('a2');
    },
    'a',
  );
  try {
    await pool.run(
      signal,
      async () => {
        calls.push('b');
      },
      'b',
    );
    assert.deepEqual(calls, ['a1', 'b']);
    cancel.abort();
    await rejected;
  } finally {
    release();
  }
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['a1', 'b', 'a2']);
  await assert.rejects(
    pool.run(
      signal,
      async () => {
        throw new Error('failed');
      },
      'a',
    ),
  );
  await pool.run(
    signal,
    async () => {
      calls.push('a3');
    },
    'a',
  );
  assert.equal(calls.at(-1), 'a3');
});
