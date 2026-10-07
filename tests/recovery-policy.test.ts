import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryPolicyFeedback, recoveryStrategyKey } from '../server/services/recovery-policy.js';
test('strategy fingerprint ignores explanation/order but preserves operational changes', () => {
  const a = {
    scope: 's',
    before: { files: { b: '2', a: '1' } },
    action: {
      name: 'run_command',
      arguments: { command: 'test', reason: 'first', timeoutSeconds: 120 },
    },
  };
  const b = {
    scope: 's',
    before: { files: { a: '1', b: '2' } },
    action: {
      name: 'run_command',
      arguments: { timeoutSeconds: 120, reason: 'second', command: 'test' },
    },
  };
  assert.equal(recoveryStrategyKey(a), recoveryStrategyKey(b));
  assert.notEqual(recoveryStrategyKey(a), recoveryStrategyKey({ ...b, scope: 'other' }));
  assert.notEqual(
    recoveryStrategyKey(a),
    recoveryStrategyKey({
      ...b,
      action: { ...b.action, arguments: { ...b.action.arguments, timeoutSeconds: 900 } },
    }),
  );
});

test('denial or missing execution evidence is not learned as an ineffective operation', () => {
  const record = {
    id: 'r1',
    runId: 'run',
    status: 'ineffective',
    action: { name: 'run_command', arguments: {} },
    check: { name: 'read_file' },
    actionEventId: 1,
    checkEventId: 2,
  };
  const store: any = {
    list: () => [record],
    db: {
      prepare: () => ({
        get: () => ({
          run_id: 'run',
          type: 'tool.completed',
          data: JSON.stringify({ name: 'run_command', outcome: { status: 'denied' } }),
        }),
      }),
    },
  };
  const feedback = recoveryPolicyFeedback(store, { id: 'run' } as any);
  assert.equal(feedback[0].grounded, false);
  assert.equal(feedback[0].strategyKey, undefined);
  assert.equal(feedback[0].recommendation, 'inspect-missing-evidence');
});
