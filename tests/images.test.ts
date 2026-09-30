import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeImage } from '../server/services/images.js';
import { withToolImages } from '../server/providers/protocol.js';
import { fetchPublicImage } from '../server/services/network.js';
test('pixels normalize under model limits and reject nonimages', async () => {
  const b = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const result = await normalizeImage(b);
  assert.ok(result.metadata.width * result.metadata.height <= 640000);
  assert.ok(result.metadata.bytes <= 1048576);
  assert.ok(result.metadata.resized);
  await assert.rejects(normalizeImage(Buffer.from('<svg></svg>')));
  await assert.rejects(normalizeImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
});
test('tool images follow every tool result in batch without changing checkpoints', () => {
  const messages: any[] = [
    { role: 'assistant', content: '', calls: [{ id: 'a' }, { id: 'b' }] },
    { role: 'tool', callId: 'a', content: 'image', images: ['data:image/png;base64,AA=='] },
    { role: 'tool', callId: 'b', content: 'other' },
  ];
  const result = withToolImages(messages);
  assert.deepEqual(
    result.map((m) => m.role),
    ['assistant', 'tool', 'tool', 'user'],
  );
  assert.equal(result[1].images, undefined);
  assert.equal(result[3].images?.length, 1);
  assert.equal(messages[1].images.length, 1);
});
test('public image fetch denies loopback', async () => {
  await assert.rejects(
    fetchPublicImage('http://127.0.0.1/x.png', AbortSignal.timeout(5000)),
    /Private|loopback/,
  );
});
