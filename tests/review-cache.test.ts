import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewContent, ReviewFlights } from '../server/services/review-cache.js';

test('review serialization retains exact action and array order with stable object keys', () => {
  const a = {
    sandbox: 'docker',
    humanMessages: [{ id: 0, text: 'read' }],
    request: { z: 1, a: 'echo one' },
  };
  const b = {
    request: { a: 'echo one', z: 1 },
    humanMessages: [{ text: 'read', id: 0 }],
    sandbox: 'docker',
  };
  assert.equal(reviewContent(a), reviewContent(b));
  assert.deepEqual(JSON.parse(reviewContent(a)).request, a.request);
  const c = reviewContent({ ...a, request: { command: 'echo two' } });
  assert.equal(reviewContent(a).split(',"request"')[0], c.split(',"request"')[0]);
  assert.notEqual(
    reviewContent({ humanMessages: [1, 2] }),
    reviewContent({ humanMessages: [2, 1] }),
  );
});
test('flights do not cross cancellation scope or request key; failures are evicted', async () => {
  const flights = new ReviewFlights<number>();
  const signal = new AbortController().signal;
  let calls = 0;
  const work = async () => {
    calls++;
    throw Error('failure');
  };
  const a = flights.get(signal, 'a', '1', work);
  const b = flights.get(signal, 'a', '2', work);
  assert.equal(a.work, b.work);
  const c = flights.get(new AbortController().signal, 'a', '3', work);
  const d = flights.get(signal, 'b', '4', work);
  assert.notEqual(a.work, c.work);
  assert.notEqual(a.work, d.work);
  await Promise.allSettled([a.work, b.work, c.work, d.work]);
  await assert.rejects(flights.get(signal, 'a', '5', work).work);
  assert.equal(calls, 4);
});
