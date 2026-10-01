import test from 'node:test';
import assert from 'node:assert/strict';
import { submitMedia, pollMedia, extractMedia } from '../server/services/media-adapters.js';
import type { MediaConnection, MediaJob } from '../shared/media.js';
const c = (protocol: MediaConnection['protocol'], model = 'fixture'): MediaConnection => ({
  id: 'm',
  name: 'MiniMax',
  protocol,
  kind: protocol === 'minimax-video' ? 'video' : 'image',
  baseUrl: 'https://api.minimax.io',
  apiKey: 'fixture-secret',
  model,
  enabled: true,
  defaults: {},
  estimatedUsd: null,
});
const res = (body: any) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
test('MiniMax images use native auth and normalize base64 without forwarding input URLs', async () => {
  const result = await submitMedia(
    c('minimax-image', 'image-01'),
    'draw',
    { reference_images: ['data:image/png;base64,AA=='] },
    undefined,
    async (url, init) => {
      assert.equal(url, 'https://api.minimax.io/v1/image_generation');
      assert.equal((init.headers as any).Authorization, 'Bearer fixture-secret');
      const b = JSON.parse(String(init.body));
      assert.equal(b.response_format, 'base64');
      assert.equal(b.subject_reference[0].type, 'character');
      return res({ base_resp: { status_code: 0 }, data: { image_base64: ['AA=='] } });
    },
  );
  assert.deepEqual(extractMedia(result.data).assets, [{ base64: 'AA==', mime: 'image/png' }]);
});
test('MiniMax speech and music decode audio and force nonstreaming transport', async () => {
  for (const protocol of ['minimax-speech', 'minimax-music'] as const) {
    const result = await submitMedia(
      c(protocol),
      'hello',
      { stream: true, output_format: 'url' },
      undefined,
      async (url, init) => {
        assert.ok(
          url.endsWith(protocol === 'minimax-speech' ? '/v1/t2a_v2' : '/v1/music_generation'),
        );
        const body = JSON.parse(String(init.body));
        assert.equal(body.stream, false);
        assert.equal(body.output_format, 'hex');
        return res({ data: { audio: '494433' }, base_resp: { status_code: 0 } });
      },
    );
    assert.equal(result.binary?.bytes.toString(), 'ID3');
    assert.equal(result.binary?.mime, 'audio/mpeg');
  }
});
test('MiniMax transcription uploads actual file and returns editable text', async () => {
  const result = await submitMedia(
    c('minimax-transcription', 'asr-1.0'),
    '',
    {},
    { bytes: Buffer.from('audio'), mime: 'audio/webm', name: 'clip.webm' },
    async (url, init) => {
      assert.equal(url, 'https://api.minimax.io/v1/speech_to_text');
      const form = init.body as FormData;
      assert.equal(await (form.get('file') as Blob).text(), 'audio');
      assert.equal(form.get('response_format'), 'json');
      return res({ text: 'transcribed' });
    },
  );
  assert.equal(extractMedia(result.data).text, 'transcribed');
});
test('MiniMax H3 and legacy Hailuo persist receipts and only GET on polling', async () => {
  for (const model of ['MiniMax-H3', 'MiniMax-Hailuo-2.3']) {
    const config = c('minimax-video', model);
    const h3 = model === 'MiniMax-H3';
    const receipt = await submitMedia(
      config,
      'scene',
      { first_frame_image: 'https://example.com/image.png' },
      undefined,
      async (url, init) => {
        assert.equal(init.method, 'POST');
        assert.ok(url.endsWith(h3 ? '/v2/video_generation' : '/v1/video_generation'));
        const body = JSON.parse(String(init.body));
        if (h3) assert.equal(body.content[1].role, 'first_frame');
        else assert.equal(body.first_frame_image, 'https://example.com/image.png');
        return res({ task_id: 'remote' });
      },
    );
    let calls = 0;
    const out = await pollMedia(config, receipt as unknown as MediaJob, async (url, init) => {
      calls++;
      assert.equal(init.method, 'GET');
      if (h3)
        return res({
          task: { status: 'succeeded', content: { url: 'https://cdn.example/movie.mp4' } },
        });
      if (url.includes('/files/retrieve'))
        return res({ file: { download_url: 'https://cdn.example/movie.mp4' } });
      return res({ status: 'Success', file_id: 'file-1', base_resp: { status_code: 0 } });
    });
    assert.equal(out.state, 'done');
    assert.equal(calls, h3 ? 1 : 2);
    assert.equal(extractMedia(out.data).assets[0].url, 'https://cdn.example/movie.mp4');
  }
});
test('MiniMax HTTP-200 business errors are failures, never silently successful or resubmitted', async () => {
  let calls = 0;
  await assert.rejects(
    submitMedia(c('minimax-image'), 'x', {}, undefined, async () => {
      calls++;
      return res({ base_resp: { status_code: 1008, status_msg: 'fixture-secret' } });
    }),
    (err: any) => err.code === 'MEDIA_PROVIDER' && !err.message.includes('fixture-secret'),
  );
  assert.equal(calls, 1);
  const out = await pollMedia(
    c('minimax-video'),
    { statusUrl: 'https://api.minimax.io/v2/query/video_generation/id' } as MediaJob,
    async () => res({ task: { status: 'failed' } }),
  );
  assert.equal(out.state, 'failed');
});
