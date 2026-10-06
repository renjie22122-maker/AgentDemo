import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../build/server/http/app.js';
import { extractIsolated } from '../build/server/services/document-parser.js';
import sharp from 'sharp';
const directory = await mkdtemp(join(tmpdir(), 'amadeus-build-'));
let app;
try {
  ({ app } = await createApp({ directory }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/health');
  assert.equal(response.status, 200);
  const doc = join(directory, 'unicode.txt');
  await writeFile(doc, '你好 🌍');
  assert.equal(await extractIsolated(doc, 10000), '你好 🌍');
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  assert.equal((await sharp(png).metadata()).width, 2);
  const require = createRequire(import.meta.url);
  const transformerRequire = createRequire(require.resolve('@huggingface/transformers'));
  const ort = transformerRequire('onnxruntime-node');
  assert.equal(typeof ort.InferenceSession.create, 'function');
  console.log(
    'Compiled HTTP service, isolated document worker, image codec and ONNX module load passed. No model download/inference or OS sandbox certification.',
  );
} finally {
  if (app) await app.close();
  await rm(directory, { recursive: true, force: true });
}
