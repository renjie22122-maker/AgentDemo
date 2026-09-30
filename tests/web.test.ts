import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch, searchWeb } from '../server/services/web-search.js';
import { fetchPublic } from '../server/services/network.js';
import { Configuration } from '../server/services/settings.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('search requires native evidence and preserves deduplicated citations', () => {
  assert.throws(
    () => parseSearch({ content: [{ type: 'text', text: 'invented https://example.com' }] }, 6),
    /native search evidence/,
  );
  assert.throws(
    () =>
      parseSearch({ content: [{ type: 'web_search_tool_result', content: { type: 'error' } }] }, 6),
    /provider reported/,
  );
  const data = parseSearch(
    {
      content: [
        {
          type: 'text',
          text: 'Answer',
          citations: [{ url: 'https://example.com/', cited_text: 'Evidence' }],
        },
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', url: 'https://example.com/', title: 'Example' },
            { type: 'web_search_result', url: 'https://example.com/' },
            { type: 'web_search_result', url: 'javascript:bad' },
          ],
        },
      ],
    },
    6,
  );
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].snippet, 'Evidence');
});
test('web fetch denies private addresses and observes cancellation', async () => {
  for (const url of ['http://127.0.0.1', 'http://[::1]', 'http://10.0.0.1', 'file:///etc/passwd'])
    await assert.rejects(fetchPublic(url, new AbortController().signal));
  const c = new AbortController();
  c.abort();
  await assert.rejects(fetchPublic('https://example.com', c.signal));
});
test('search scopes credentials and accounts actual auxiliary usage', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'web-test-'));
  const config = new Configuration(join(dir, 'settings.json'));
  config.save({
    ...config.get(),
    profiles: [
      {
        id: 'ds',
        name: 'DS',
        transport: 'openai-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'fixture-only',
        model: 'test',
      },
    ],
    defaultProfileId: 'ds',
  });
  let requests = 0;
  const charged: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    requests++;
    assert.equal(init.redirect, 'error');
    assert.match(url, /anthropic\/v1\/messages$/);
    return Response.json({
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 2 },
      content: [{ type: 'web_search_tool_result', content: [] }],
    });
  });
  const data = await searchWeb('query', 6, config.get(), new AbortController().signal, (u) =>
    charged.push(u),
  );
  assert.equal(data.sources.length, 0);
  assert.equal(charged[0].input, 12);
  assert.equal(charged[0].cached, 2);
  await assert.rejects(
    searchWeb(
      'query',
      6,
      {
        ...config.get(),
        web: { ...config.get().web!, searchBaseUrl: 'https://unrelated.example' },
      },
      new AbortController().signal,
      () => {},
    ),
    /connection origin/,
  );
  await assert.rejects(
    searchWeb(
      'query',
      6,
      { ...config.get(), web: { ...config.get().web!, enabled: false } },
      new AbortController().signal,
      () => {},
    ),
    /disabled/,
  );
  assert.equal(requests, 1);
});
