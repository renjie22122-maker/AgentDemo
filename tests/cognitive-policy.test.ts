import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cognitivePolicy,
  initialCognitiveState,
  type Observation,
} from '../server/core/cognitive-policy.js';
const observation: Observation = {
  calls: [['read_file', { path: 'a' }]],
  outputs: ['same'],
  tasks: [],
};
test('policy is deterministic, bounded and grants one corrective cycle before stop', () => {
  let state = initialCognitiveState();
  const original = structuredClone(state);
  assert.deepEqual(cognitivePolicy(state, observation), cognitivePolicy(state, observation));
  assert.deepEqual(state, original);
  for (let i = 0; i < 8; i++) {
    const d = cognitivePolicy(state, observation);
    state = d.state;
    assert.equal(d.action, i === 3 ? 'change-strategy' : i === 7 ? 'stop' : 'none');
  }
  assert.equal(state.signals.confidence, null);
  assert.equal(state.signals.semanticDrift, null);
});
test('changing output may prompt review but never implies a repeated-trajectory stop', () => {
  let state = initialCognitiveState();
  for (let i = 0; i < 4; i++) state = cognitivePolicy(state, observation).state;
  for (let i = 0; i < 16; i++) {
    const d = cognitivePolicy(state, { ...observation, outputs: ['new-' + i] });
    state = d.state;
    assert.ok(d.action === 'none' || d.action === 'review-plan');
  }
  assert.ok(state.window.length <= 12);
  const d = cognitivePolicy(state, { ...observation, tasks: [{ id: 'work', status: 'done' }] });
  assert.equal(d.state.signals.completedTaskDelta, 1);
  assert.equal(d.state.warnedCycle, undefined);
});
test('failure advice is cooled down and does not repeatedly flood the context', () => {
  let state = initialCognitiveState(),
    advice = 0;
  for (let i = 0; i < 15; i++) {
    const d = cognitivePolicy(state, { ...observation, outputs: ['Tool error: failure ' + i] });
    state = d.state;
    if (d.action === 'diagnose-blocker') advice++;
  }
  assert.equal(advice, 1);
});
test('verification obligation comes from task board, not arbitrary conversation guesses', () => {
  const initial = initialCognitiveState();
  assert.equal(cognitivePolicy(initial, { ...observation, tasks: [] }).action, 'none');
  assert.equal(
    cognitivePolicy(initial, {
      ...observation,
      tasks: [
        { id: 'build', status: 'running', kind: 'implement' },
        { id: 'test', status: 'pending', kind: 'verify' },
      ],
    }).action,
    'none',
  );
  assert.equal(
    cognitivePolicy(initial, {
      ...observation,
      tasks: [
        { id: 'build', status: 'done', kind: 'implement' },
        { id: 'test', status: 'pending', kind: 'verify' },
      ],
    }).action,
    'verify',
  );
  assert.equal(
    cognitivePolicy(initial, { ...observation, tasks: [{ id: 'build', status: 'blocked' }] })
      .action,
    'review-plan',
  );
});

test('command exit failures count as failures but a read file containing code is not a command result', () => {
  let state = initialCognitiveState();
  for (let i = 0; i < 3; i++) {
    const d = cognitivePolicy(state, {
      ...observation,
      calls: [['run_command', {}]],
      outputs: [JSON.stringify({ code: 1, stderr: 'failure ' + i })],
    });
    state = d.state;
    assert.equal(d.action, i === 2 ? 'diagnose-blocker' : 'none');
  }
  const read = cognitivePolicy(initialCognitiveState(), {
    ...observation,
    outputs: ['{"code":1}'],
  });
  assert.equal(read.state.signals.toolErrors, 0);
});

test('event-driven waiting never becomes a repeated-work stop', () => {
  let state = initialCognitiveState();
  for (let i = 0; i < 30; i++) {
    const d = cognitivePolicy(state, {
      ...observation,
      calls: [['wait_background_command', { id: 'job' }]],
      outputs: ['still waiting'],
    });
    state = d.state;
    assert.equal(d.action, 'none');
  }
  assert.equal(state.window.length, 0);
});
test('advice outcomes distinguish a changed trajectory from completed work', () => {
  let state = initialCognitiveState();
  for (let i = 0; i < 4; i++) state = cognitivePolicy(state, observation).state;
  const changed = cognitivePolicy(state, { ...observation, outputs: ['different reading'] });
  assert.equal(changed.state.lastAdviceOutcome?.result, 'trajectory-changed');
  const advanced = cognitivePolicy(state, { ...observation, tasks: [{ id: 'a', status: 'done' }] });
  assert.equal(advanced.state.lastAdviceOutcome?.result, 'task-advanced');
});
test('a cleared failure condition can generate new advice if the problem recurs', () => {
  let state = initialCognitiveState(),
    advice = 0;
  for (let i = 0; i < 3; i++) {
    const d = cognitivePolicy(state, { ...observation, outputs: ['Tool error: ' + i] });
    state = d.state;
    if (d.action === 'diagnose-blocker') advice++;
  }
  state = cognitivePolicy(state, { ...observation, outputs: ['working'] }).state;
  for (let i = 0; i < 4; i++) {
    const d = cognitivePolicy(state, { ...observation, outputs: ['Tool error: again ' + i] });
    state = d.state;
    if (d.action === 'diagnose-blocker') advice++;
  }
  assert.equal(advice, 2);
});

test('new host verification is distinguished from a changed tool trajectory', () => {
  let state = initialCognitiveState();
  for (let i = 0; i < 4; i++) state = cognitivePolicy(state, observation).state;
  const decision = cognitivePolicy(state, {
    ...observation,
    tasks: [{ id: 'verify', status: 'done', verification: { status: 'checked', eventId: 71 } }],
  });
  assert.equal(decision.state.lastAdviceOutcome?.result, 'verification-recorded');
});

test('changing targets remain exploration; changing timestamps on one target get bounded advice', () => {
  let state = initialCognitiveState(),
    advice = 0;
  for (let i = 0; i < 32; i++) {
    const d = cognitivePolicy(state, { ...observation, outputs: ['timestamp ' + i] });
    state = d.state;
    assert.notEqual(d.action, 'stop');
    if (d.action === 'review-plan') advice++;
  }
  assert.equal(advice, 3);
  assert.equal(state.signals.variableOutputLoop, true);
  for (let i = 0; i < 32; i++) {
    const d = cognitivePolicy(state, {
      ...observation,
      calls: [['read_file', { path: 'file-' + i }]],
      outputs: ['text ' + i],
    });
    state = d.state;
    assert.equal(d.action, 'none');
  }
  assert.equal(state.signals.targetNovelty, 1);
  const waiting = cognitivePolicy(state, {
    ...observation,
    calls: [['wait_background_command', { id: 'job' }]],
  });
  assert.equal(waiting.state.signals.variableOutputLoop, false);
  assert.deepEqual(waiting.state.targetWindow, []);
});
