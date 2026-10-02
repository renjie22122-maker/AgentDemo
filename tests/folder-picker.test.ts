import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForFolderPicker, parsePickedFolders } from '../server/services/folder-picker.js';
function fake() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kills: 0,
    kill() {
      this.kills++;
      return true;
    },
  });
}
test('folder picker timeout returns even without process close', async () => {
  const child = fake();
  await assert.rejects(waitForFolderPicker(child as any, undefined, 10), /timed out/);
  assert.equal(child.kills, 1);
  child.emit('close', 0);
});
test('folder picker cancellation kills only its process and ignores late result', async () => {
  const child = fake(),
    controller = new AbortController();
  const result = waitForFolderPicker(child as any, controller.signal);
  controller.abort();
  await assert.rejects(result, /cancelled/);
  assert.equal(child.kills, 1);
  child.stdout.emit('data', Buffer.from('late'));
  child.emit('close', 0);
});
test('folder picker returns selected path or null on user cancel', async () => {
  for (const value of ['C:\\folder', '']) {
    const child = fake(),
      result = waitForFolderPicker(child as any);
    child.stdout.emit('data', Buffer.from(value));
    child.emit('close', 0);
    assert.equal(await result, value || null);
    assert.equal(child.kills, 0);
  }
});

test('Explorer selection decodes multiple paths, deduplicates and validates results', () => {
  assert.deepEqual(parsePickedFolders(JSON.stringify(['C:\\one', 'D:\\two', 'C:\\one'])), [
    'C:\\one',
    'D:\\two',
  ]);
  assert.deepEqual(parsePickedFolders('[]'), []);
  assert.throws(() => parsePickedFolders('{}'));
  assert.throws(() => parsePickedFolders('[1]'));
  assert.throws(() => parsePickedFolders(JSON.stringify(Array(13).fill('C:\\one'))));
});
