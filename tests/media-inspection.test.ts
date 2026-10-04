import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMedia, mediaRange } from '../server/services/media-inspection.js';
const box = (name: string, ...data: Buffer[]) => {
  const body = Buffer.concat(data),
    head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8);
  head.write(name, 4);
  return Buffer.concat([head, body]);
};
const track = (kind: string) =>
  box('trak', box('mdia', box('hdlr', Buffer.alloc(8), Buffer.from(kind))));
test('MP4 tracks distinguish audio, silent and incomplete sources without guessing', () => {
  assert.equal(
    inspectMedia(box('moov', track('vide'), track('soun')), 'video/mp4').audio,
    'present',
  );
  assert.equal(inspectMedia(box('moov', track('vide')), 'video/mp4').audio, 'absent');
  assert.equal(inspectMedia(box('moov'), 'video/mp4').audio, 'unknown');
  assert.equal(inspectMedia(Buffer.from('soun'), 'video/mp4').audio, 'unknown');
  const corrupt = box('moov', track('vide'));
  corrupt.writeUInt32BE(999999);
  assert.equal(inspectMedia(corrupt, 'video/mp4').audio, 'unknown');
  assert.equal(inspectMedia(box('moov', track('soun')), 'video/webm').audio, 'unknown');
  assert.equal(inspectMedia(box('mdat', Buffer.from('soun')), 'video/mp4').audio, 'unknown');
});
test('media byte ranges handle seeking, suffixes and invalid requests', () => {
  assert.deepEqual(mediaRange('bytes=1-3', 10), { start: 1, end: 3 });
  assert.deepEqual(mediaRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(mediaRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.deepEqual(mediaRange('bytes=0-100', 10), { start: 0, end: 9 });
  for (const value of ['bytes=-0', 'bytes=-', 'bytes=5-2', 'bytes=10-', 'bytes=0-1,4-5'])
    assert.equal(mediaRange(value, 10), false);
  assert.equal(mediaRange(undefined, 10), null);
});
