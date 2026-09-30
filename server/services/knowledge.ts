import { AnnIndex } from './ann.js';
import { createHash } from 'node:crypto';
import { assert } from '../core/errors.js';
import { Store, id } from '../storage/store.js';
import { Embeddings, cosine } from './embedding.js';
export const terms = (text: string) => {
  const lower = text.toLowerCase();
  return [...lower.matchAll(/[a-z0-9_]{2,}/g)]
    .map((x) => x[0])
    .concat([...lower.matchAll(/[\u3400-\u9fff]/g)].map((x) => x[0]));
};
export class Knowledge {
  private ann = new AnnIndex();
  lastRetrieval: Record<string, unknown> = {};
  close() {
    this.ann.close();
  }
  constructor(
    private store: Store,
    private embeddings?: Embeddings,
  ) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS vector_revision(id INTEGER PRIMARY KEY,version INTEGER NOT NULL);
    INSERT OR IGNORE INTO vector_revision VALUES(1,0);
    CREATE TRIGGER IF NOT EXISTS vectors_insert AFTER INSERT ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;
    CREATE TRIGGER IF NOT EXISTS vectors_update AFTER UPDATE OF vector ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;
    CREATE TRIGGER IF NOT EXISTS vectors_delete AFTER DELETE ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;`);
  }
  import(scope: string, name: string, text: string) {
    assert(
      text.trim(),
      'EMPTY_DOCUMENT',
      'No readable text was extracted. Scanned images require OCR first.',
    );
    assert(
      text.length <= 5000000,
      'DOCUMENT_TOO_LARGE',
      'Extracted document exceeds 5 million characters.',
    );
    const key = id(),
      hash = createHash('sha256').update(text).digest('hex');
    this.store.transaction(() => {
      this.store.put('document', {
        id: key,
        scope,
        name,
        characters: text.length,
        createdAt: Date.now(),
        hash,
      });
      for (let offset = 0, ordinal = 0; offset < text.length; offset += 1400, ordinal++) {
        const chunk = id(),
          body = text.slice(offset, offset + 1800);
        this.store.db
          .prepare(
            'INSERT INTO chunks(id,scope,document_id,name,ordinal,text,source_hash) VALUES(?,?,?,?,?,?,?)',
          )
          .run(chunk, scope, key, name, ordinal, body, hash);
        this.store.db
          .prepare('INSERT INTO chunk_fts(id,terms) VALUES(?,?)')
          .run(chunk, terms(body).join(' '));
      }
    });
    return this.store.get('document', key);
  }
  search(scopes: string[], query: string, limit = 6) {
    if (!scopes.length) return [];
    const tokens = [...new Set(terms(query))].slice(0, 40);
    if (!tokens.length) return [];
    const expression = tokens.map((t) => '"' + t.replaceAll('"', '""') + '"').join(' OR ');
    const rows = this.store.db
      .prepare(
        'SELECT c.*,bm25(chunk_fts) AS rank FROM chunk_fts JOIN chunks c ON c.id=chunk_fts.id WHERE chunk_fts MATCH ? AND c.scope IN (' +
          scopes.map(() => '?').join(',') +
          ') ORDER BY rank LIMIT 500',
      )
      .all(expression, ...scopes) as any[];
    const q = [...new Set(terms(query))],
      N = rows.length;
    const docs = rows.map((r) => ({ ...r, t: terms(r.text) }));
    const df = new Map(q.map((t) => [t, docs.filter((d) => d.t.includes(t)).length]));
    return docs
      .map((d) => {
        let score = 0;
        for (const t of q) {
          const n = d.t.filter((x: string) => x === t).length;
          score +=
            (Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5)) * n * 2.2) /
            (n + 1.2 * (0.25 + (0.75 * d.t.length) / 300));
        }
        return {
          id: d.id,
          documentId: d.document_id,
          name: d.name,
          ordinal: d.ordinal,
          scope: d.scope,
          text: d.text,
          score,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  async index(key: string) {
    assert(this.embeddings?.enabled(), 'EMBEDDING_DISABLED', 'Configure embeddings first.');
    const rows = this.store.db
      .prepare('SELECT id,text FROM chunks WHERE document_id=? ORDER BY ordinal')
      .all(key) as any[];
    assert(rows.length, 'NOT_FOUND', 'Document not found');
    for (let i = 0; i < rows.length; i += 16) {
      const batch = rows.slice(i, i + 16),
        vectors = await this.embeddings!.encode(batch.map((r) => r.text));
      this.store.transaction(() => {
        for (let n = 0; n < batch.length; n++)
          this.store.db
            .prepare('UPDATE chunks SET vector=? WHERE id=?')
            .run(
              JSON.stringify({ model: this.embeddings!.fingerprint(), values: vectors[n] }),
              batch[n].id,
            );
      });
    }
    return { chunks: rows.length, model: this.embeddings!.fingerprint() };
  }
  async hybrid(scopes: string[], query: string, limit = 6, signal?: AbortSignal) {
    const lexical = this.search(scopes, query, 30);
    if (!this.embeddings?.enabled() || !scopes.length) return lexical.slice(0, limit);
    const [q] = await this.embeddings.encode([query], signal);
    const rows = this.store.db
      .prepare(
        'SELECT * FROM chunks WHERE vector IS NOT NULL AND scope IN (' +
          scopes.map(() => '?').join(',') +
          ')',
      )
      .all(...scopes) as any[];
    const vectors = rows
      .map((r) => ({ ...r, v: JSON.parse(r.vector) }))
      .filter(
        (r) =>
          r.v.model === this.embeddings!.fingerprint() &&
          r.v.values.length === q.length &&
          r.v.values.every(Number.isFinite),
      );
    if (!vectors.length) return lexical.slice(0, limit);
    let ranked: { id: string; score: number }[];
    if (vectors.length < 2000) {
      ranked = vectors
        .map((r) => ({ id: r.id, score: cosine(q, r.v.values) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
      this.lastRetrieval = { backend: 'exact', chunks: vectors.length };
    } else {
      const revision = (
        this.store.db.prepare('SELECT version FROM vector_revision WHERE id=1').get() as any
      ).version;
      const generation = JSON.stringify([
        revision,
        [...scopes].sort(),
        this.embeddings.fingerprint(),
        q.length,
      ]);
      const result = await this.ann.search(
        generation,
        vectors.map((r) => ({ id: r.id, values: r.v.values })),
        q,
        30,
        signal,
      );
      assert(
        (this.store.db.prepare('SELECT version FROM vector_revision WHERE id=1').get() as any)
          .version === revision,
        'INDEX_CHANGED',
        'Knowledge changed during retrieval; search again.',
      );
      ranked = result.result;
      this.lastRetrieval = {
        backend: 'hnsw',
        chunks: vectors.length,
        buildMs: result.buildMs,
        searchMs: result.searchMs,
      };
    }
    const byId = new Map(vectors.map((r) => [r.id, r]));
    const semantic = ranked
      .filter((r) => this.store.db.prepare('SELECT id FROM chunks WHERE id=?').get(r.id))
      .map((hit) => {
        const r = byId.get(hit.id)!;
        return {
          id: r.id,
          documentId: r.document_id,
          name: r.name,
          ordinal: r.ordinal,
          scope: r.scope,
          text: r.text,
          score: hit.score,
        };
      });
    const merged = new Map<string, any>();
    for (const list of [lexical, semantic])
      list.forEach((r, i) => {
        const old = merged.get(r.id);
        merged.set(r.id, { ...r, score: (old?.score || 0) + 1 / (60 + i + 1) });
      });
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
  remove(key: string) {
    this.store.transaction(() => {
      this.store.db
        .prepare('DELETE FROM chunk_fts WHERE id IN (SELECT id FROM chunks WHERE document_id=?)')
        .run(key);
      this.store.db.prepare('DELETE FROM chunks WHERE document_id=?').run(key);
      this.store.remove('document', key);
    });
  }
}
