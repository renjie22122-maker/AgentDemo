import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoReview } from '../server/services/auto-review.js';
import { Inputs } from '../server/services/approvals.js';
import { Configuration } from '../server/services/settings.js';
import { Store } from '../server/storage/store.js';
import type { Run } from '../shared/types.js';
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-review-'));
  const store = new Store(join(dir, 'db.sqlite')),
    config = new Configuration(join(dir, 'settings.json'));
  config.save({
    ...config.get(),
    profiles: [
      {
        id: 'test',
        name: 'Test',
        transport: 'openai-chat',
        baseUrl: 'https://review.example',
        model: 'test',
      },
    ],
    defaultProfileId: 'test',
  });
  store.put('conversation', { id: 'chat', permission: 'auto' });
  const run = {
    id: 'run',
    conversationId: 'chat',
    profileId: 'test',
    status: 'running',
    checkpoints: [],
  } as unknown as Run;
  store.put('run', run);
  return { store, config, run };
}
test('automatic approval is a separate tool-free request and records its rationale and usage', async () => {
  const f = await setup();
  let count = 0;
  const review = new AutoReview(f.store, f.config, () => ({
    complete: async (req) => {
      count++;
      assert.equal(req.tools.length, 0);
      return {
        message: {
          role: 'assistant',
          content: '{"decision":"allow","reason":"Explicit bounded read"}',
        },
        usage: { input: 20, output: 10, cached: 0, measured: true },
      };
    },
  }));
  const inputs = new Inputs(f.store, (...args) => review.review(...args));
  const answer = await inputs.request(
    f.run,
    'approval',
    { command: 'echo hello' },
    new AbortController().signal,
  );
  assert.match(answer, /Approved by automatic/);
  assert.equal(count, 1);
  assert.equal(f.store.list<any>('approval-review')[0].usage.input, 20);
  assert.equal(f.store.list<any>('input')[0].status, 'answered');
  f.store.close();
});
test('review failure, malformed output and explicit human gates all require a person', async () => {
  const f = await setup();
  for (const content of ['not JSON', '{"decision":"allow"}']) {
    const review = new AutoReview(f.store, f.config, () => ({
      complete: async () => ({
        message: { role: 'assistant', content },
        usage: { input: 1, output: 1, cached: 0, measured: true },
      }),
    }));
    assert.equal((await review.review(f.run, {}, new AbortController().signal)).decision, 'ask');
  }
  let called = false;
  const review = new AutoReview(f.store, f.config, () => ({
    complete: async () => {
      called = true;
      throw Error();
    },
  }));
  assert.equal(
    (await review.review(f.run, { forceHuman: true }, new AbortController().signal)).decision,
    'ask',
  );
  assert.equal(called, false);
  assert.equal((await review.review(f.run, {}, new AbortController().signal)).decision, 'ask');
  f.store.close();
});
test('ask mode bypasses reviewer and mode changes invalidate automatic permission', async () => {
  const f = await setup();
  let count = 0;
  const review = new AutoReview(f.store, f.config, () => ({
    complete: async () => {
      count++;
      f.store.put('conversation', { id: 'chat', permission: 'ask' });
      return {
        message: { role: 'assistant', content: '{"decision":"allow","reason":"ok"}' },
        usage: { input: 1, output: 1, cached: 0, measured: true },
      };
    },
  }));
  assert.equal((await review.review(f.run, {}, new AbortController().signal)).decision, 'ask');
  assert.equal(await review.review(f.run, {}, new AbortController().signal), null);
  assert.equal(count, 1);
  f.store.close();
});
