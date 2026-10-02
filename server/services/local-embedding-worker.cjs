const { parentPort } = require('node:worker_threads');
const path = require('node:path');

const fs = require('node:fs');
const crypto = require('node:crypto');
const REVISION = '0b7ea4d6ad2e9d527e013a65b805a4b4df72f648';
const SIZE = 118308185;
const SHA = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
async function ensureWeights(cache) {
  const file = path.join(
    cache,
    'Xenova/multilingual-e5-small',
    REVISION,
    'onnx/model_quantized.onnx',
  );
  const digest = async (p) => {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(p)) hash.update(chunk);
    return hash.digest('hex');
  };
  const valid = async (p) =>
    fs.existsSync(p) && fs.statSync(p).size === SIZE && (await digest(p)) === SHA;
  if (await valid(file)) return;
  if (process.env.AGENTDEMO_LOCAL_MODELS_ONLY === '1')
    throw Error('Local model weights are not cached; offline mode forbids download.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = file + '.part';
  if (fs.existsSync(file)) {
    if (!fs.existsSync(part) && fs.statSync(file).size < SIZE) fs.renameSync(file, part);
    else fs.unlinkSync(file);
  }
  let offset = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (offset >= SIZE) {
    if (await valid(part)) {
      fs.renameSync(part, file);
      return;
    }
    fs.unlinkSync(part);
    offset = 0;
  }
  const response = await fetch(
    'https://huggingface.co/Xenova/multilingual-e5-small/resolve/' +
      REVISION +
      '/onnx/model_quantized.onnx',
    {
      headers: offset ? { Range: 'bytes=' + offset + '-' } : {},
      signal: AbortSignal.timeout(540000),
    },
  );
  if (!response.ok) throw Error('Model download HTTP ' + response.status);
  if (response.status !== 206) offset = 0;
  const out = fs.openSync(part, offset ? 'a' : 'w');
  try {
    for await (const chunk of response.body) fs.writeSync(out, chunk);
  } finally {
    fs.closeSync(out);
  }
  if (!(await valid(part))) {
    fs.unlinkSync(part);
    throw Error('Model checksum mismatch; incomplete weights were removed.');
  }
  fs.renameSync(part, file);
}
let extractor;
parentPort.on('message', async ({ texts, purpose }) => {
  try {
    if (!extractor) {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.resolve('.data/models');
      if (process.env.AGENTDEMO_LOCAL_MODELS_ONLY === '1') env.allowRemoteModels = false;
      await ensureWeights(env.cacheDir);
      extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
        revision: '0b7ea4d6ad2e9d527e013a65b805a4b4df72f648',
        dtype: 'q8',
        device: 'cpu',
      });
    }
    const result = [];
    for (const text of texts) {
      const out = await extractor(purpose + ': ' + text, { pooling: 'mean', normalize: true });
      result.push(out.tolist()[0]);
    }
    parentPort.postMessage({ vectors: result });
  } catch (e) {
    parentPort.postMessage({ error: String(e.message || e) });
  }
});
