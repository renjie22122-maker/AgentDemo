import { Store, id } from '../storage/store.js';
import { MemoryLifecycle, memoryValid, normalizedMemory, sourceKey } from './memory-lifecycle.js';
import { assert } from '../core/errors.js';
export interface GraphEvidence {
  type: 'memory' | 'document' | 'event';
  id: string;
  conversationId?: string;
  quote: string;
}
export interface GraphEdge {
  id: string;
  scope: string;
  from: string;
  to: string;
  relation: string;
  evidence: GraphEvidence[];
  active: boolean;
  validFrom: number;
  validUntil: number | null;
  revision: number;
  createdAt: number;
}
export class KnowledgeGraph {
  constructor(private store: Store) {}
  supported(scope: string, e: GraphEvidence, at: number) {
    if (e.type === 'memory') {
      const m = this.store.maybe<any>('memory', e.id);
      return (
        !!m &&
        m.scope === scope &&
        memoryValid(m, at) &&
        new MemoryLifecycle(this.store).evidenceValid(m) &&
        m.content.includes(e.quote)
      );
    }
    if (e.type === 'document') {
      const d = this.store.maybe<any>('document', e.id);
      return (
        !!d &&
        d.scope === scope &&
        (d.validFrom ?? d.createdAt) <= at &&
        (!d.validUntil || at < d.validUntil) &&
        (
          this.store.db.prepare('SELECT text FROM chunks WHERE document_id=?').all(e.id) as any[]
        ).some((c) => c.text.includes(e.quote))
      );
    }
    const c = this.store.maybe<any>('conversation', e.conversationId || '');
    const scoped = c?.projectId ? 'project:' + c.projectId : 'user';
    const event = c && this.store.events(c.id).find((x) => String(x.id) === e.id);
    return (
      scoped === scope &&
      !this.store.maybe(
        'memory-source-forgotten',
        sourceKey(scope, e.conversationId || '', Number(e.id)),
      ) &&
      event &&
      event.createdAt <= at &&
      ['user.message', 'tool.completed'].includes(event.type) &&
      JSON.stringify(event.data).includes(e.quote)
    );
  }
  put(edge: Omit<GraphEdge, 'id' | 'revision' | 'createdAt'>, key?: string) {
    const memory = new MemoryLifecycle(this.store);
    memory.entity(edge.scope, edge.from);
    memory.entity(edge.scope, edge.to);
    assert(edge.from !== edge.to, 'GRAPH_SELF', 'Choose two different entities.');
    assert(
      edge.evidence.length > 0 &&
        edge.evidence.every((e) => e.quote.trim() && this.supported(edge.scope, e, edge.validFrom)),
      'GRAPH_EVIDENCE',
      'Source quote, time or scope does not match.',
    );
    assert(
      edge.validUntil == null || edge.validUntil > edge.validFrom,
      'GRAPH_TIME',
      'Invalid validity interval.',
    );
    const old = key ? this.store.get<GraphEdge>('knowledge-edge', key) : null;
    assert(
      !old || old.scope === edge.scope,
      'GRAPH_SCOPE',
      'Cannot move a relation between scopes.',
    );
    const value = {
      ...edge,
      id: key || id(),
      revision: (old?.revision || 0) + 1,
      createdAt: old?.createdAt || Date.now(),
    };
    this.store.put('knowledge-edge-history', {
      id: id(),
      edgeId: value.id,
      before: old,
      after: value,
      at: Date.now(),
    });
    return this.store.put('knowledge-edge', value);
  }
  list(scope: string) {
    return this.store.list<GraphEdge>('knowledge-edge').filter((e) => e.scope === scope);
  }
  search(scopes: string[], query: string, at = Date.now(), depth = 2) {
    const entities = this.store
      .list<any>('memory-entity')
      .filter((e) => scopes.includes(e.scope) && e.confirmed !== false);
    const q = normalizedMemory(query);
    const seeds = entities
      .filter((e) =>
        [e.id, e.name, ...e.aliases].some((label: string) => q.includes(normalizedMemory(label))),
      )
      .map((e) => e.id);
    const allowed = this.store
      .list<GraphEdge>('knowledge-edge')
      .filter(
        (e) =>
          scopes.includes(e.scope) &&
          e.active &&
          e.validFrom <= at &&
          (e.validUntil == null || at < e.validUntil) &&
          e.evidence.every((x) => this.supported(e.scope, x, at)),
      );
    const seen = new Set(seeds),
      paths: { entities: string[]; edges: GraphEdge[] }[] = seeds
        .slice(0, 12)
        .map((id) => ({ entities: [id], edges: [] }));
    const results: typeof paths = [];
    for (let hop = 0; hop < Math.min(3, Math.max(1, depth)); hop++) {
      const frontier = paths.filter((p) => p.edges.length === hop);
      for (const p of frontier)
        for (const e of allowed) {
          const end = p.entities.at(-1);
          if (e.from !== end && e.to !== end) continue;
          const next = e.from === end ? e.to : e.from;
          if (p.entities.includes(next)) continue;
          const path = { entities: [...p.entities, next], edges: [...p.edges, e] };
          results.push(path);
          if (!seen.has(next)) {
            seen.add(next);
            paths.push(path);
          }
          if (results.length >= 40)
            return {
              entities: entities.filter((e) => seen.has(e.id)),
              paths: results,
              truncated: true,
            };
        }
    }
    return { entities: entities.filter((e) => seen.has(e.id)), paths: results, truncated: false };
  }
}
