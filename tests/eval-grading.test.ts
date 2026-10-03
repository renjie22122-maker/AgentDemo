import test from 'node:test';
import assert from 'node:assert/strict';
import { actionAnswer } from '../evals/context-control/grading.js';
test('action grader separates formatting from semantic choice and rejects ambiguous decisions', () => {
  assert.equal(actionAnswer('verify'), 'verify');
  assert.equal(actionAnswer('{"decision":"verify","reason":"pending tests"}'), 'verify');
  assert.equal(actionAnswer('{"action":"wait","decision":"verify"}'), null);
  assert.equal(actionAnswer('I should not verify, continue.'), null);
  assert.equal(actionAnswer('{"action":"delete"}'), null);
  assert.equal(actionAnswer('{"reason":"verify"}'), null);
});
