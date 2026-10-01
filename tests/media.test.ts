import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MediaConnection, MediaJob } from '../shared/media.js';
import {
  submitMedia,
  pollMedia,
  mediaHttp,
  extractMedia,
} from '../server/services/media-adapters.js';
import { MediaService, safeGlb } from '../server/services/media.js';
import { Configuration } from '../server/services/settings.js';
import { Store } from '../server/storage/store.js';
const connection = (
  protocol: MediaConnection['protocol'],
  kind: MediaConnection['kind'] = 'image',
): MediaConnection => ({
  id: 'service',
  name: 'fixture',
  protocol,
  kind,
  baseUrl: 'https://media.example/v1',
  apiKey: 'fixture-key',
  model: 'fixture/model',
  enabled: true,
  defaults: {},
  estimatedUsd: null,
});
const response = (data: any) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
test('media protocols send scoped auth and never retry submissions', async () => {
  for (const protocol of [
    'openai-image',
    'gemini-image',
    'gemini-music',
    'meshy',
    'tripo',
  ] as const) {
    let count = 0;
    let sent: any;
    const out = await submitMedia(
      connection(protocol),
      'hello',
      {},
      undefined,
      async (url, init) => {
        count++;
        sent = { url, body: JSON.parse(String(init.body)), headers: init.headers };
        return response(
          protocol === 'meshy'
            ? { result: 'task' }
            : protocol === 'tripo'
              ? { data: { task_id: 'task' } }
              : { data: [{ b64_json: 'AA==' }] },
        );
      },
    );
    assert.equal(count, 1);
    assert.ok(sent.url.startsWith('https://media.example/'));
    assert.ok(out.data);
  }
  let calls = 0;
  await assert.rejects(
    submitMedia(connection('openai-image'), 'x', {}, undefined, async () => {
      calls++;
      throw Error('connection dropped');
    }),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    mediaHttp(connection('openai-image'), 'https://foreign.example/result', {}, async () => {
      throw Error('must not fetch');
    }),
    { code: 'MEDIA_ORIGIN' },
  );
});
test('fal stores returned receipt URLs; completed requests download result without new POST', async () => {
  const c = connection('fal');
  let urls: string[] = [];
  const receipt = await submitMedia(c, 'draw', {}, undefined, async (_url, init) => {
    assert.equal(init.method, 'POST');
    return response({
      request_id: 'job',
      status_url: c.baseUrl + '/job/status',
      response_url: c.baseUrl + '/job/result',
      cancel_url: c.baseUrl + '/job/cancel',
    });
  });
  const out = await pollMedia(c, { ...receipt } as unknown as MediaJob, async (url, init) => {
    urls.push(url);
    assert.equal(init.method, 'GET');
    return response(
      url.endsWith('/status')
        ? { status: 'COMPLETED' }
        : { images: [{ url: 'https://assets.example/image.png' }] },
    );
  });
  assert.equal(out.state, 'done');
  assert.deepEqual(urls, [c.baseUrl + '/job/status', c.baseUrl + '/job/result']);
});
test('transcription uses actual audio bytes and correct provider-specific upload protocol', async () => {
  const audio = { bytes: Buffer.from('audio-fixture'), mime: 'audio/webm', name: 'recording.webm' };
  for (const protocol of ['openai-transcription', 'deepgram', 'assemblyai'] as const) {
    let calls = 0;
    const c = connection(protocol, 'transcription');
    await submitMedia(c, '', {}, audio, async (url, init) => {
      calls++;
      if (protocol === 'openai-transcription') {
        assert.ok(init.body instanceof FormData);
        assert.equal((init.body.get('file') as File).name, 'recording.webm');
      }
      if (protocol === 'deepgram')
        assert.deepEqual(Buffer.from(init.body as Uint8Array), audio.bytes);
      return response(
        url.endsWith('/upload')
          ? { upload_url: 'https://uploads.example/audio' }
          : { id: 'transcript', text: 'hello' },
      );
    });
    assert.equal(calls, protocol === 'assemblyai' ? 2 : 1);
  }
});
test('native asynchronous video requests retain the provider operation ID', async () => {
  for (const protocol of ['openai-video', 'gemini-video', 'replicate'] as const) {
    const c = connection(protocol, 'video');
    const r = await submitMedia(c, 'scene', {}, undefined, async () =>
      response(
        protocol === 'gemini-video' ? { name: 'operations/id' } : { id: 'id', status: 'queued' },
      ),
    );
    assert.ok(r.remoteId);
    assert.ok(r.statusUrl?.startsWith(c.baseUrl));
  }
});
test('media result parsing handles image, music, 3D and transcription without fetching input URLs', () => {
  assert.equal(extractMedia({ data: [{ b64_json: 'YWJj' }] }).assets[0].base64, 'YWJj');
  assert.equal(
    extractMedia({
      steps: [{ content: [{ type: 'audio', data: 'YWJj', mime_type: 'audio/mpeg' }] }],
    }).assets[0].mime,
    'audio/mpeg',
  );
  assert.equal(
    extractMedia({
      model_mesh: { url: 'https://assets.example/model.glb' },
      input: { image_url: 'https://private.example/source' },
    }).assets.length,
    1,
  );
  assert.equal(
    extractMedia({ results: { channels: [{ alternatives: [{ transcript: '中文' }] }] } }).text,
    '中文',
  );
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-media-'));
  const store = new Store(join(dir, 'db.sqlite')),
    config = new Configuration(join(dir, 'settings.json'));
  config.save({
    ...config.get(),
    media: {
      connections: [connection('openai-image')],
      transcriptionId: '',
      autoApproveMaxUsd: null,
    },
  });
  store.put('conversation', { id: 'chat' });
  return { dir, store, config };
}
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRkcAAAAASUVORK5CYII=';
test('generation operation identity deduplicates concurrent submissions; local outputs are scoped', async () => {
  const f = await fixture();
  let requests = 0;
  const media = new MediaService(f.store, f.config, f.dir, async () => {
    requests++;
    return response({ data: [{ b64_json: png }] });
  });
  const args = {
    connectionId: 'service',
    conversationId: 'chat',
    operationKey: 'same',
    prompt: 'image',
  };
  const [a, b] = await Promise.all([media.submit(args), media.submit(args)]);
  assert.equal(a.id, b.id);
  await media.close();
  assert.equal(requests, 1);
  const job = media.get(a.id, 'chat');
  assert.equal(job.status, 'completed');
  assert.equal(job.outputs.length, 1);
  assert.throws(() => media.get(a.id, 'different'), { code: 'MEDIA_SCOPE' });
  const file = f.store.get<any>('media-file', a.id + ':0');
  assert.ok((await readFile(file.path)).length);
  f.store.close();
});
test('interrupted submission becomes unknown and is never automatically resubmitted', async () => {
  const f = await fixture();
  let requests = 0;
  f.store.put('media-job', {
    id: 'j',
    operationKey: 'old',
    conversationId: 'chat',
    status: 'submitting',
    createdAt: 1,
    outputs: [],
  });
  const media = new MediaService(f.store, f.config, f.dir, async () => {
    requests++;
    return response({});
  });
  media.start();
  await media.close();
  assert.equal(media.get('j', 'chat').status, 'unknown');
  assert.equal(requests, 0);
  f.store.close();
});
test('media keys never appear in public settings and are not reused after origin changes', async () => {
  const f = await fixture();
  assert.ok(!JSON.stringify(f.config.public()).includes('fixture-key'));
  const next = f.config.public();
  next.media.connections[0].baseUrl = 'https://other.example';
  f.config.save(next);
  assert.equal(f.config.get().media!.connections[0].apiKey, '');
  f.store.close();
});
test('safe GLB preview rejects external resources and malformed files', () => {
  const glb = (j: any) => {
    let s = JSON.stringify(j);
    s += ' '.repeat((4 - (s.length % 4)) % 4);
    const b = Buffer.alloc(20 + s.length);
    b.write('glTF');
    b.writeUInt32LE(2, 4);
    b.writeUInt32LE(b.length, 8);
    b.writeUInt32LE(s.length, 12);
    b.writeUInt32LE(0x4e4f534a, 16);
    b.write(s, 20);
    return b;
  };
  assert.equal(safeGlb(glb({ asset: { version: '2.0' } })), true);
  assert.equal(safeGlb(glb({ images: [{ uri: 'https://private.example/secret' }] })), false);
  assert.equal(safeGlb(Buffer.from('not a model')), false);
});
