import { createHash } from 'node:crypto';
import type { Run } from '../../shared/types.js';
import { Store, id } from '../storage/store.js';
import { assert } from '../core/errors.js';
export function recordWebEvidence(
  store: Store,
  run: Run,
  page: { url: string; text: string; status: number; truncated: boolean; [key: string]: unknown },
) {
  const value = {
    ...page,
    id: id(),
    conversationId: run.conversationId,
    runId: run.id,
    retrievedAt: new Date().toISOString(),
    sourceHash: createHash('sha256').update(page.text).digest('hex'),
    hashScope: 'stored extracted text, possibly truncated; not original response bytes',
    trust: 'untrusted-web-content',
  };
  store.put('web-evidence', value);
  return {
    ...page,
    evidenceId: value.id,
    retrievedAt: value.retrievedAt,
    sourceHash: value.sourceHash,
    hashScope: value.hashScope,
    trust: value.trust,
  };
}
export function readWebEvidence(
  store: Store,
  run: Run,
  key: string,
  offset: number,
  characters: number,
) {
  const source = store.get<any>('web-evidence', key);
  assert(
    source.conversationId === run.conversationId,
    'WEB_EVIDENCE_SCOPE',
    'Source belongs to another conversation.',
  );
  const end = Math.min(source.text.length, offset + characters);
  return {
    id: source.id,
    url: source.url,
    status: source.status,
    retrievedAt: source.retrievedAt,
    sourceHash: source.sourceHash,
    hashScope: source.hashScope,
    sourceTruncated: source.truncated,
    trust: source.trust,
    offset,
    text: source.text.slice(offset, end),
    totalCharacters: source.text.length,
    nextOffset: end < source.text.length ? end : null,
    links: source.links,
  };
}
