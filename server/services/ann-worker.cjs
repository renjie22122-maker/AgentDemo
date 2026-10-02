const { parentPort } = require('node:worker_threads');
const { HierarchicalNSW } = require('hnswlib-node');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const cache = new Map();
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function cosine(a, b) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function exact(rows, q, k) {
  return rows
    .map((r, i) => ({ i, score: cosine(r.values, q) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, k);
}
function calibrate(index, rows) {
  const k = Math.min(10, rows.length);
  let found = 0,
    total = 0;
  for (let s = 0; s < Math.min(4, rows.length); s++) {
    const a = rows[Math.floor((s * rows.length) / 4)].values,
      b = rows[(Math.floor((s * rows.length) / 4) + 17) % rows.length].values;
    const q = a.map((v, i) => v * 0.65 + b[i] * 0.35),
      truth = exact(rows, q, k);
    const hits = index.searchKnn(q, k).neighbors;
    // Equal-distance alternatives count as correct; ties are common in small fixtures.
    const threshold = truth.at(-1).score - 1e-5;
    found += hits.filter((i) => cosine(rows[i].values, q) >= threshold).length;
    total += k;
  }
  return total ? found / total : 1;
}
parentPort.on('message', ({ id, key, rows, query, k, cacheDirectory }) => {
  try {
    if (rows && rows.length === 0) {
      cache.clear();
      parentPort.postMessage({
        id,
        key,
        result: [],
        buildMs: 0,
        searchMs: 0,
        backend: 'empty',
        cacheSource: 'none',
      });
      return;
    }
    let entry = cache.get(key),
      buildMs = 0,
      cacheSource = 'memory';
    if (!entry) {
      if (!rows?.length) throw Error('Index generation expired or empty');
      if (rows.some((r) => r.values.length !== query.length || !r.values.every(Number.isFinite)))
        throw Error('Invalid vectors');
      const start = performance.now(),
        index = new HierarchicalNSW('cosine', query.length);
      let loaded = false,
        binary,
        manifest;
      if (cacheDirectory) {
        binary = path.join(cacheDirectory, digest(key) + '.bin');
        manifest = binary + '.json';
        try {
          const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
          if (
            meta.version !== 1 ||
            meta.key !== key ||
            meta.dimension !== query.length ||
            meta.ids.join('\n') !== rows.map((r) => r.id).join('\n') ||
            digest(fs.readFileSync(binary)) !== meta.sha256
          )
            throw Error('Stale/corrupt ANN cache');
          index.readIndexSync(binary);
          loaded = true;
        } catch {}
      }
      if (!loaded) {
        index.initIndex(rows.length, 24, 200, 42);
        rows.forEach((r, i) => index.addPoint(r.values, i));
      }
      let ef = 256,
        recall = 0;
      for (const candidate of [256, 512, 1024]) {
        ef = candidate;
        index.setEf(ef);
        recall = calibrate(index, rows);
        if (recall >= 0.95) break;
      }
      const fallback = recall < 0.95;
      entry = {
        index,
        ids: rows.map((r) => r.id),
        rows,
        fallback,
        calibration: {
          sampleRecall: recall,
          probes: Math.min(4, rows.length),
          k: Math.min(10, rows.length),
          ef,
          threshold: 0.95,
        },
      };
      cacheSource = loaded ? 'disk' : 'built';
      if (!loaded && binary && !fallback) {
        let temp;
        try {
          fs.mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
          temp = binary + '.' + crypto.randomUUID() + '.tmp';
          index.writeIndexSync(temp);
          const sha256 = digest(fs.readFileSync(temp));
          fs.renameSync(temp, binary);
          temp = manifest + '.' + crypto.randomUUID() + '.tmp';
          fs.writeFileSync(
            temp,
            JSON.stringify({
              version: 1,
              key,
              dimension: query.length,
              ids: entry.ids,
              sha256,
              calibration: entry.calibration,
            }),
            { mode: 0o600 },
          );
          fs.renameSync(temp, manifest);
          const entries = fs
            .readdirSync(cacheDirectory)
            .filter((n) => /^[a-f0-9]{64}\.bin$/.test(n))
            .map((n) => ({ n, t: fs.statSync(path.join(cacheDirectory, n)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
          for (const old of entries.slice(4)) {
            fs.rmSync(path.join(cacheDirectory, old.n), { force: true });
            fs.rmSync(path.join(cacheDirectory, old.n + '.json'), { force: true });
          }
        } catch {
        } finally {
          if (temp)
            try {
              fs.rmSync(temp, { force: true });
            } catch {}
        }
      }
      cache.clear();
      cache.set(key, entry);
      buildMs = performance.now() - start;
    }
    const start = performance.now();
    let result;
    if (entry.fallback)
      result = exact(entry.rows, query, Math.min(k, entry.ids.length)).map((r) => ({
        id: entry.ids[r.i],
        score: r.score,
      }));
    else {
      const r = entry.index.searchKnn(query, Math.min(k, entry.ids.length));
      result = r.neighbors.map((n, i) => ({ id: entry.ids[n], score: 1 - r.distances[i] }));
    }
    parentPort.postMessage({
      id,
      key,
      result,
      buildMs,
      searchMs: performance.now() - start,
      cacheSource,
      backend: entry.fallback ? 'exact-calibration-fallback' : 'hnsw',
      calibration: entry.calibration,
    });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e) });
  }
});
