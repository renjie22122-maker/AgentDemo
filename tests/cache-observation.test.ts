import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prefixObservation,
  comparePrefix,
  contextComponents,
} from '../server/core/cache-observation.js';
import { messageUnits } from '../server/core/context-budget.js';
import type { Profile, ModelMessage } from '../shared/types.js';
const p = {
  transport: 'openai-chat',
  baseUrl: 'https://example.com',
  model: 'x',
  reasoning: 'none',
} as Profile;
test('cache telemetry distinguishes observed prefix changes from measured provider usage', () => {
  const messages: ModelMessage[] = [
    { role: 'system', content: 'fixed' },
    { role: 'user', content: 'private text' },
  ];
  const a = prefixObservation(messages, [], p),
    b = prefixObservation([...messages, { role: 'user', content: 'next' }], [], p);
  const metrics = comparePrefix(a, b, { input: 100, output: 2, cached: 80, measured: true });
  assert.equal(metrics.unchangedMessages, 2);
  assert.equal(metrics.cacheRatio, 0.8);
  assert.equal(metrics.systemChanged, false);
  assert.ok(!JSON.stringify(a).includes('private text'));
  assert.equal(
    comparePrefix(a, prefixObservation(messages, [], { ...p, model: 'y' }), {
      input: 0,
      output: 0,
      cached: 0,
      measured: false,
    }).routeChanged,
    true,
  );
  assert.equal(
    comparePrefix(undefined, a, { input: 0, output: 0, cached: 0, measured: false }).cacheRatio,
    null,
  );
});
test('local delta metadata does not inflate model context estimates', () => {
  const m: ModelMessage = { role: 'tool', callId: 'a', content: 'short diff' };
  assert.equal(
    messageUnits([m]),
    messageUnits([
      {
        ...m,
        contextPatch: 'x'.repeat(10000),
        contextSourceCallId: 'old',
        contextResultHash: 'hash',
      },
    ]),
  );
  const parts = contextComponents([{ role: 'system', content: 'abc' }, m], []);
  assert.equal(parts.characters.instructions, 3);
  assert.equal(parts.characters.toolResults, 10);
});
