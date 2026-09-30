const { parentPort } = require('node:worker_threads');
const { HierarchicalNSW } = require('hnswlib-node');
const cache = new Map();
parentPort.on('message', ({ id, key, rows, query, k }) => {
  try {
    let entry = cache.get(key),
      buildMs = 0;
    if (!entry) {
      if (!rows) throw new Error('Index generation expired');
      const start = performance.now(),
        index = new HierarchicalNSW('cosine', query.length);
      index.initIndex(Math.max(1, rows.length), 24, 200, 42);
      rows.forEach((r, i) => index.addPoint(r.values, i));
      index.setEf(256);
      entry = { index, ids: rows.map((r) => r.id) };
      cache.clear();
      cache.set(key, entry);
      buildMs = performance.now() - start;
    }
    const start = performance.now();
    const result = entry.index.searchKnn(query, Math.min(k, entry.ids.length));
    parentPort.postMessage({
      id,
      key,
      result: result.neighbors.map((n, i) => ({
        id: entry.ids[n],
        score: 1 - result.distances[i],
      })),
      buildMs,
      searchMs: performance.now() - start,
    });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e) });
  }
});
