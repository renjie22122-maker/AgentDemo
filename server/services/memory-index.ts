import { createHash } from 'node:crypto';
import type { Memory } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { Embeddings, cosine } from './embedding.js';
import { recallMemories } from './memory-retrieval.js';
const hash = (m: Memory) =>
  createHash('sha256')
    .update(JSON.stringify([m.content, m.revision, m.scope]))
    .digest('hex');
export class MemoryIndex {
  constructor(
    private store: Store,
    private embeddings: Embeddings,
  ) {}
  // Explicit user action only: inactive candidates never leave the machine for embedding.
  async index(scope?: string) {
    const fingerprint = this.embeddings.fingerprint();
    let indexed = 0;
    for (const m of this.store
      .list<Memory>('memory')
      .filter(
        (m) =>
          (!scope || m.scope === scope) && m.active && (!m.expiresAt || m.expiresAt > Date.now()),
      )) {
      const existing = this.store.maybe<any>('memory-vector', m.id);
      if (existing?.hash === hash(m) && existing?.model === fingerprint) continue;
      const [values] = await this.embeddings.encode([m.content]);
      const current = this.store.maybe<Memory>('memory', m.id);
      if (
        current?.active &&
        hash(current) === hash(m) &&
        this.embeddings.fingerprint() === fingerprint
      ) {
        this.store.put('memory-vector', { id: m.id, hash: hash(m), model: fingerprint, values });
        indexed++;
      }
    }
    return { indexed, model: fingerprint };
  }
  async recall(
    query: string,
    projectId: string | null,
    signal: AbortSignal,
    includeUserMemory = true,
  ) {
    const memories = this.store
        .list<Memory>('memory')
        .filter((m) => includeUserMemory || m.scope !== 'user'),
      scores = new Map<string, number>();
    const eligible = memories.filter(
      (m) =>
        m.active &&
        (!m.expiresAt || m.expiresAt > Date.now()) &&
        (m.scope === 'user' || (!!projectId && m.scope === 'project:' + projectId)),
    );
    const vectors = eligible
      .map((m) => ({ m, v: this.store.maybe<any>('memory-vector', m.id) }))
      .filter(({ m, v }) => v?.hash === hash(m) && v.model === this.embeddings.fingerprint());
    let method = 'scoped-lexical',
      fallback: string | undefined;
    if (this.embeddings.enabled() && vectors.length) {
      try {
        const [q] = await this.embeddings.encode([query], signal);
        for (const { m, v } of vectors) {
          const score = cosine(q, v.values);
          if (score >= 0.35) scores.set(m.id, score);
        }
        method = 'scoped-hybrid';
      } catch (error) {
        if (signal.aborted) throw error;
        fallback = 'Embedding unavailable; lexical recall used.';
      }
    }
    // Re-read scope/activation after any remote request; concurrent deletion or edits must win.
    const current = this.store
      .list<Memory>('memory')
      .filter((m) => includeUserMemory || m.scope !== 'user');
    for (const m of memories)
      if (!current.some((c) => c.id === m.id && hash(c) === hash(m))) scores.delete(m.id);
    return {
      memories: recallMemories(current, query, projectId, Date.now(), scores),
      method,
      fallback,
    };
  }
}
