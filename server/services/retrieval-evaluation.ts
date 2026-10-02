import { Store } from '../storage/store.js';
import { Knowledge } from './knowledge.js';
import { createHash } from 'node:crypto';
export async function evaluateRetrieval(store: Store, knowledge: Knowledge, scope: string) {
  const cases = store
    .list<any>('retrieval-case')
    .filter((c) => c.scope === scope && c.source === 'user')
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 40);
  const docs = store.list<any>('document').filter((d) => d.scope === scope && d.validUntil == null);
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        cases,
        docs.map((d) => [d.id, d.hash]),
        store.db.prepare('SELECT version FROM vector_revision WHERE id=1').get(),
      ]),
    )
    .digest('hex');
  const old = store.maybe<any>('retrieval-evaluation', scope);
  if (old?.key === key) return old;
  const rows = [];
  for (const c of cases) {
    if (!docs.some((d) => d.id === c.documentId)) continue;
    const lexical = knowledge.search([scope], c.query, 5);
    const hybrid = await knowledge.hybrid([scope], c.query, 5, undefined, Date.now(), true);
    const rank = (hits: any[]) => {
      const n = hits.findIndex((h) => h.documentId === c.documentId);
      return n < 0 ? 0 : 1 / (n + 1);
    };
    rows.push({ id: c.id, lexical: rank(lexical), hybrid: rank(hybrid) });
  }
  // Separate held-out subset; never auto-promote on tiny or agent-authored labels.
  const train = rows.filter((_, i) => i % 3 !== 0),
    test = rows.filter((_, i) => i % 3 === 0);
  const mean = (rs: any[], mode: string) =>
    rs.length ? rs.reduce((a, r) => a + r[mode], 0) / rs.length : 0;
  const candidate = mean(train, 'hybrid') >= mean(train, 'lexical') ? 'hybrid' : 'lexical';
  const promote =
    rows.length >= 15 &&
    test.length >= 5 &&
    mean(test, candidate) >= mean(test, candidate === 'hybrid' ? 'lexical' : 'hybrid') + 0.1;
  const value = {
    id: scope,
    key,
    cases: rows.length,
    heldOut: test.length,
    lexicalMRR: mean(test, 'lexical'),
    hybridMRR: mean(test, 'hybrid'),
    candidate,
    promoted: promote,
    at: Date.now(),
    status: rows.length < 15 ? 'needs_more_labels' : 'evaluated',
  };
  store.put('retrieval-evaluation', value);
  if (promote) store.put('retrieval-policy', { id: scope, mode: candidate, evidenceKey: key });
  return value;
}
