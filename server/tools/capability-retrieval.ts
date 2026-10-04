import { createHash } from 'node:crypto';
import { Embeddings, cosine } from '../services/embedding.js';
import type { ToolSpec, Settings } from '../../shared/types.js';
import { findTools } from './discovery.js';
const vectors = new Map<string, number[][]>();
export async function retrieveTools(
  specs: ToolSpec[],
  query: string,
  offset: number,
  limit: number,
  settings: Settings['embedding'],
  signal: AbortSignal,
  semantic: boolean,
) {
  const lexical = findTools(specs, query, 0, specs.length);
  if (!semantic || !query || settings.backend !== 'local')
    return {
      ...findTools(specs, query, offset, limit),
      method: 'lexical',
      semanticStatus: semantic ? 'local embedding not configured' : 'not requested',
    };
  const encoder = new Embeddings(() => settings);
  const key = createHash('sha256')
    .update(encoder.fingerprint() + JSON.stringify(specs.map((x) => [x.name, x.description])))
    .digest('hex');
  try {
    let matrix = vectors.get(key);
    if (!matrix) {
      matrix = await encoder.encode(
        specs.map((x) => x.name + ' ' + x.description),
        signal,
      );
      if (vectors.size >= 4) vectors.delete(vectors.keys().next().value!);
      vectors.set(key, matrix);
    }
    const [q] = await encoder.encode([query], signal, 'query');
    const semanticRanks = specs
      .map((tool, i) => ({ tool, score: cosine(q, matrix![i]) }))
      .sort((a, b) => b.score - a.score);
    const scores = new Map<string, number>();
    lexical.results.forEach((t, i) => scores.set(t.name, 1 / (60 + i + 1)));
    semanticRanks.forEach((x, i) =>
      scores.set(x.tool.name, (scores.get(x.tool.name) || 0) + 1 / (60 + i + 1)),
    );
    const ranked = specs
      .slice()
      .sort((a, b) => (scores.get(b.name) || 0) - (scores.get(a.name) || 0));
    return {
      total: ranked.length,
      results: ranked.slice(offset, offset + limit),
      method: 'local-semantic-rrf',
      semanticStatus: 'available',
    };
  } catch (error) {
    signal.throwIfAborted();
    return {
      ...findTools(specs, query, offset, limit),
      method: 'lexical',
      semanticStatus: 'local embedding unavailable; fallback used',
    };
  }
}
