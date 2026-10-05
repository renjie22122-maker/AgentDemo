import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDecay } from '../shared/memory-decay.js';
import { memoryReach } from '../shared/memory-scope.js';
import { recallMemories } from '../server/services/memory-retrieval.js';
import type { Memory } from '../shared/types.js';
const day = 86400000;
const base: Memory = {
  id: 'm',
  scope: 'user',
  content: 'river encounter',
  source: 'User',
  active: true,
  status: 'active',
  revision: 1,
  createdAt: 1,
  expiresAt: null,
};
test('stable facts survive age, episodes decay by time and user turns with independent overrides', () => {
  assert.equal(memoryDecay({ ...base, kind: 'preference' }, 3650 * day, 100000).factor, 1);
  assert.equal(
    memoryDecay({ ...base, scope: 'project:a', kind: 'decision' }, 3650 * day, 100000).factor,
    1,
  );
  assert.equal(memoryDecay({ ...base, kind: 'episode' }, 30 * day + 1, 100).factor, 0.25);
  assert.equal(
    memoryDecay({ ...base, kind: 'episode', decayPolicy: 'stable' }, 30 * day + 1, 100).factor,
    1,
  );
  assert.equal(memoryDecay({ ...base, decayPolicy: 'turns' }, 300 * day + 1, 100).factor, 0.5);
  assert.equal(memoryDecay({ ...base, decayPolicy: 'time' }, 30 * day + 1, 10000).factor, 0.5);
  assert.equal(memoryDecay({ ...base, kind: 'episode' }, 99999 * day, 99999).factor, 0.05);
  assert.equal(memoryReach({ ...base, kind: 'episode' }), 'conversation');
  assert.equal(memoryReach({ ...base, kind: 'decision' }), 'conversation');
  assert.equal(memoryReach({ ...base, kind: 'preference' }), 'scope');
});
test('decay affects ranking without deleting or expanding recall scope', () => {
  const recent = {
    ...base,
    id: 'recent',
    kind: 'episode' as const,
    sourceConversationId: 'chat',
    createdAt: 31 * day,
  };
  const old = { ...recent, id: 'old', content: 'river scene', createdAt: 1 };
  const result = recallMemories(
    [old, recent],
    'river',
    null,
    31 * day,
    undefined,
    'chat',
    new Map([['old', 100]]),
  );
  assert.equal(result[0].id, 'recent');
  assert.equal(result.length, 2);
  assert.ok(result[1].decay.factor < result[0].decay.factor);
  assert.equal(
    recallMemories([old, recent], 'river', null, 31 * day, undefined, 'other').length,
    0,
  );
  assert.equal(old.active, true);
});
