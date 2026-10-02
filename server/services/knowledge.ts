import { dirname, join } from 'node:path';
import { structuredChunks, documentAt, documentEligibilitySQL } from './knowledge-versions.js';
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
  private ann: AnnIndex;
  lastRetrieval: Record<string, unknown> = {};
  close() {
    this.ann.close();
  }
  constructor(
    private store: Store,
    private embeddings?: Embeddings,
  ) {
    this.ann = new AnnIndex(
      store.path === ':memory:' ? undefined : join(dirname(store.path), 'ann-cache'),
    );
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS vector_revision(id INTEGER PRIMARY KEY,version INTEGER NOT NULL);
    INSERT OR IGNORE INTO vector_revision VALUES(1,0);
    CREATE TRIGGER IF NOT EXISTS vectors_insert AFTER INSERT ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;
    CREATE TRIGGER IF NOT EXISTS vectors_update AFTER UPDATE OF vector ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;
    CREATE TRIGGER IF NOT EXISTS vectors_delete AFTER DELETE ON chunks BEGIN UPDATE vector_revision SET version=version+1 WHERE id=1; END;`);
  }
  import(
    scope: string,
    name: string,
    text: string,
    metadata: {
      revisionOf?: string;
      source?: string;
      validFrom?: number;
      publishedAt?: number;
    } = {},
  ) {
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
    const previous = metadata.revisionOf
      ? this.store.get<any>('document', metadata.revisionOf)
      : null;
    assert(
      !previous || previous.scope === scope,
      'DOCUMENT_SCOPE',
      'Cannot replace a document in another scope.',
    );
    const validFrom = metadata.validFrom ?? Date.now();
    assert(
      !previous ||
        (previous.validUntil == null && validFrom > (previous.validFrom ?? previous.createdAt)),
      'DOCUMENT_TIME',
      'Replace only the latest version at a later effective time.',
    );
    const key = id(),
      hash = createHash('sha256').update(text).digest('hex');
    this.store.transaction(() => {
      if (previous) this.store.put('document', { ...previous, validUntil: validFrom });
      this.store.put('document', {
        id: key,
        scope,
        name,
        characters: text.length,
        createdAt: Date.now(),
        hash,
        source: metadata.source || previous?.source || name,
        familyId: previous?.familyId || previous?.id || key,
        version: (previous?.version || 0) + 1,
        revisionOf: previous?.id,
        validFrom,
        validUntil: null,
        publishedAt: metadata.publishedAt,
      });
      for (const [ordinal, section] of structuredChunks(text).entries()) {
        const chunk = id(),
          body = section.text;
        this.store.put('chunk-metadata', {
          id: chunk,
          documentId: key,
          heading: section.heading,
          start: section.start,
          end: section.end,
        });
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
  search(scopes: string[], query: string, limit = 6, asOf = Date.now()) {
    if (!scopes.length) return [];
    const tokens = [...new Set(terms(query))].slice(0, 40);
    if (!tokens.length) return [];
    const expression = tokens.map((t) => '"' + t.replaceAll('"', '""') + '"').join(' OR ');
    const rows = this.store.db
      .prepare(
        'SELECT c.*,bm25(chunk_fts) AS rank FROM chunk_fts JOIN chunks c ON c.id=chunk_fts.id WHERE chunk_fts MATCH ? AND c.scope IN (' +
          scopes.map(() => '?').join(',') +
          ') AND c.document_id IN (' +
          documentEligibilitySQL +
          ') ORDER BY rank LIMIT 500',
      )
      .all(expression, ...scopes, asOf, asOf) as any[];
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
          ...this.citation(d.document_id, d.id),
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  async index(key: string, allowed: () => boolean = () => true) {
    assert(this.embeddings?.enabled(), 'EMBEDDING_DISABLED', 'Configure embeddings first.');
    const fingerprint = this.embeddings!.fingerprint();
    const rows = this.store.db
      .prepare('SELECT id,text,vector FROM chunks WHERE document_id=? ORDER BY ordinal')
      .all(key) as any[];
    assert(rows.length, 'NOT_FOUND', 'Document not found');
    for (let i = 0; i < rows.length; i += 16) {
      const batch = rows.slice(i, i + 16).filter((r) => {
        try {
          return JSON.parse(r.vector || 'null')?.model !== this.embeddings!.fingerprint();
        } catch {
          return true;
        }
      });
      if (!batch.length) continue;
      const vectors: number[][] = [];
      for (const row of batch) {
        assert(
          allowed() && this.embeddings!.fingerprint() === fingerprint,
          'INDEX_CANCELLED',
          'Index configuration changed.',
        );
        const reuse = this.store.db
          .prepare(
            'SELECT vector FROM chunks WHERE text=? AND scope=(SELECT scope FROM chunks WHERE id=?) AND vector IS NOT NULL LIMIT 100',
          )
          .all(row.text, row.id) as any[];
        const cached = reuse
          .map((r) => {
            try {
              return JSON.parse(r.vector);
            } catch {
              return null;
            }
          })
          .find((v) => v?.model === fingerprint);
        vectors.push(cached?.values || (await this.embeddings!.encode([row.text]))[0]);
      }
      assert(
        allowed() && this.embeddings!.fingerprint() === fingerprint,
        'EMBEDDING_CHANGED',
        'Embedding configuration changed during indexing.',
      );
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
  async hybrid(
    scopes: string[],
    query: string,
    limit = 6,
    signal?: AbortSignal,
    asOf = Date.now(),
    bypassPolicy = false,
  ) {
    if (
      !bypassPolicy &&
      scopes.length === 1 &&
      this.store.maybe<any>('retrieval-policy', scopes[0])?.mode === 'lexical'
    )
      return this.search(scopes, query, limit, asOf);
    const lexical = this.search(scopes, query, 30, asOf);
    if (!this.embeddings?.enabled() || !scopes.length)
      return this.enrich(lexical, query, limit, asOf);
    const [q] = await this.embeddings.encode([query], signal, 'query');
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
          documentAt(this.store.maybe('document', r.document_id), asOf) &&
          r.v.model === this.embeddings!.fingerprint() &&
          r.v.values.length === q.length &&
          r.v.values.every(Number.isFinite),
      );
    if (!vectors.length) return this.enrich(lexical, query, limit, asOf);
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
        backend: result.backend,
        cacheSource: result.cacheSource,
        calibration: result.calibration,
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
          ...this.citation(r.document_id, r.id),
        };
      });
    const merged = new Map<string, any>();
    for (const list of [lexical, semantic])
      list.forEach((r, i) => {
        const old = merged.get(r.id);
        merged.set(r.id, { ...r, score: (old?.score || 0) + 1 / (60 + i + 1) });
      });
    return this.enrich(
      [...merged.values()].sort((a, b) => b.score - a.score),
      query,
      limit,
      asOf,
    );
  }
  private citation(documentId: string, chunkId: string) {
    const d = this.store.maybe<any>('document', documentId);
    return {
      version: d?.version || 1,
      source: d?.source || d?.name,
      validFrom: d?.validFrom ?? d?.createdAt,
      validUntil: d?.validUntil,
      publishedAt: d?.publishedAt,
      citation: { documentId, chunkId, version: d?.version || 1 },
      heading: this.store.maybe<any>('chunk-metadata', chunkId)?.heading || '',
    };
  }
  private enrich(rows: any[], query: string, limit: number, asOf: number) {
    const queryTerms = new Set(terms(query));
    const ranked = rows
      .filter((r) => documentAt(this.store.maybe('document', r.documentId), asOf))
      .map((r, i) => ({
        ...r,
        score:
          1 / (60 + i) +
          [...new Set(terms(r.heading || ''))].filter((t) => queryTerms.has(t)).length * 0.002,
      }));
    const seen = new Set<string>();
    return ranked
      .sort((a, b) => b.score - a.score)
      .filter((r) => {
        const key = r.documentId + ':' + r.ordinal;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((r) => ({
        ...r,
        asOf,
        alternativeSources: ranked
          .filter((x) => x.documentId !== r.documentId)
          .slice(0, 4)
          .map((x) => ({
            documentId: x.documentId,
            version: x.version,
            source: x.source,
            quote: x.text.slice(0, 500),
          })),
        neighbors: this.store.db
          .prepare(
            'SELECT id,ordinal,text FROM chunks WHERE document_id=? AND ordinal BETWEEN ? AND ? AND id<>? ORDER BY ordinal',
          )
          .all(r.documentId, Math.max(0, r.ordinal - 1), r.ordinal + 1, r.id),
        evidenceNotice:
          'Retrieved passages may conflict; compare source versions and quotes. Retrieval is not a verification verdict.',
      }));
  }
  remove(key: string) {
    this.store.transaction(() => {
      this.store.db
        .prepare('DELETE FROM chunk_fts WHERE id IN (SELECT id FROM chunks WHERE document_id=?)')
        .run(key);
      this.store.db.prepare('DELETE FROM chunks WHERE document_id=?').run(key);
      for (const m of this.store.list<any>('chunk-metadata'))
        if (m.documentId === key) this.store.remove('chunk-metadata', m.id);
      this.store.remove('document', key);
    });
  }
}
