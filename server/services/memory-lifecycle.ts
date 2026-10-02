import { createHash } from 'node:crypto';
import { Store, id } from '../storage/store.js';
import type { Memory } from '../../shared/types.js';
import { assert } from '../core/errors.js';
export const normalizedMemory = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const forgottenKey = (scope: string, content: string) =>
  createHash('sha256')
    .update(scope + '\n' + normalizedMemory(content))
    .digest('hex');
export const sourceKey = (scope: string, chat: string, event: number) =>
  createHash('sha256')
    .update(JSON.stringify([scope, chat, event]))
    .digest('hex');
export function memoryValid(m: Memory, at = Date.now()) {
  return (
    (m.active || (m.status === 'superseded' && at < (m.validUntil ?? 0))) &&
    m.status !== 'disputed' &&
    m.status !== 'forgotten' &&
    (m.validFrom ?? m.createdAt) <= at &&
    (m.validUntil == null || at < m.validUntil) &&
    (!m.expiresAt || at < m.expiresAt)
  );
}
export class MemoryLifecycle {
  constructor(private store: Store) {}
  private record(before: Memory | null, after: Memory, reason: string) {
    this.store.put('memory-history', {
      id: id(),
      memoryId: after.id,
      scope: after.scope,
      before,
      after,
      reason,
      at: Date.now(),
    });
    this.store.put('memory', after);
    this.store.remove('memory-vector', after.id);
    return after;
  }
  evidenceValid(m: Memory) {
    if (m.kind !== 'experience') return true;
    return (
      !!m.evidence?.length &&
      !!m.conditions?.trim() &&
      m.evidence.every((e) => {
        const event = this.store.events(e.conversationId).find((x) => x.id === e.eventId);
        const conversation = this.store.maybe<any>('conversation', e.conversationId);
        const scope = conversation?.projectId ? 'project:' + conversation.projectId : 'user';
        return (
          scope === m.scope &&
          event?.type === 'tool.completed' &&
          event.data.verification?.passed === true &&
          (!e.quote || JSON.stringify(event.data).includes(e.quote))
        );
      })
    );
  }
  create(m: Memory) {
    if (m.sourceConversationId && m.sourceEventId != null)
      assert(
        !this.store.maybe(
          'memory-source-forgotten',
          sourceKey(m.scope, m.sourceConversationId, m.sourceEventId),
        ),
        'FORGOTTEN_SOURCE',
        'This source was excluded from memory extraction.',
      );
    assert(
      !this.store.maybe('memory-forgotten', forgottenKey(m.scope, m.content)),
      'FORGOTTEN',
      'This content was forgotten.',
    );
    if (m.entityId) this.entity(m.scope, m.entityId);
    const conflicts = this.conflicts(m);
    for (const key of m.conflictsWith || []) {
      const other = this.store.maybe<Memory>('memory', key);
      if (
        other &&
        other.scope === m.scope &&
        memoryValid(other) &&
        !conflicts.some((x) => x.id === key)
      )
        conflicts.push(other);
    }
    const safe = m.active && !conflicts.length && this.evidenceValid(m);
    return this.record(
      null,
      {
        ...m,
        active: safe,
        status: conflicts.length ? 'disputed' : safe ? 'active' : 'candidate',
        recordedAt: Date.now(),
        validFrom: m.validFrom ?? Date.now(),
        conflictsWith: conflicts.map((x) => x.id),
      },
      'created',
    );
  }
  entity(scope: string, key: string) {
    if (key === scope || (scope === 'user' && key === 'user'))
      return { id: key, scope, name: key, aliases: [] };
    const e = this.store.get<any>('memory-entity', key);
    assert(e.confirmed !== false, 'ENTITY_UNCONFIRMED', 'Confirm this entity before use.');
    assert(e.scope === scope, 'ENTITY_SCOPE', 'Entity belongs to another scope.');
    return e;
  }
  saveEntity(scope: string, name: string, aliases: string[], key?: string) {
    const previous = key ? this.store.get<any>('memory-entity', key) : null;
    assert(
      !previous || previous.scope === scope,
      'ENTITY_SCOPE',
      'Entity belongs to another scope.',
    );
    const labels = [name, ...aliases].map(normalizedMemory);
    assert(
      !this.store
        .list<any>('memory-entity')
        .some(
          (e) =>
            e.scope === scope &&
            e.id !== key &&
            [e.name, ...e.aliases].some((x: string) => labels.includes(normalizedMemory(x))),
        ),
      'ALIAS_CONFLICT',
      'An entity already uses this name or alias in this scope.',
    );
    return this.store.put('memory-entity', {
      id: key || id(),
      scope,
      name,
      confirmed: true,
      aliases: [...new Set(aliases)],
      revision: (previous?.revision || 0) + 1,
    });
  }
  conflicts(m: Memory) {
    return this.store
      .list<Memory>('memory')
      .filter(
        (x) =>
          x.id !== m.id &&
          x.scope === m.scope &&
          memoryValid(x) &&
          ((m.entityId &&
            m.attribute &&
            x.entityId === m.entityId &&
            normalizedMemory(x.attribute || '') === normalizedMemory(m.attribute)) ||
            (!m.attribute && m.topic && x.topic === m.topic)) &&
          normalizedMemory(x.value || x.content) !== normalizedMemory(m.value || m.content),
      );
  }
  update(key: string, patch: Partial<Memory>, revision?: number) {
    const old = this.store.get<Memory>('memory', key);
    assert(
      revision == null || old.revision === revision,
      'MEMORY_CHANGED',
      'Memory changed. Refresh before editing.',
    );
    const next = { ...old, ...patch, id: old.id, scope: old.scope, revision: old.revision + 1 };
    if (next.entityId) this.entity(next.scope, next.entityId);
    assert(
      next.validUntil == null || next.validUntil > (next.validFrom ?? next.createdAt),
      'MEMORY_TIME',
      'End must be after start.',
    );
    const conflicts = this.conflicts(next);
    if (next.active) {
      assert(
        !conflicts.length,
        'MEMORY_CONFLICT',
        'Resolve conflicting entries before activation.',
      );
      assert(
        this.evidenceValid(next),
        'MEMORY_EVIDENCE',
        'Experience needs successful tool evidence and applicability conditions.',
      );
    }
    next.status = next.active ? 'active' : conflicts.length ? 'disputed' : 'candidate';
    return this.record(old, next, 'edited');
  }
  resolve(winnerId: string, loserIds: string[], revision: number, at = Date.now()) {
    return this.store.transaction(() => {
      const winner = this.store.get<Memory>('memory', winnerId);
      assert(winner.revision === revision, 'MEMORY_CHANGED', 'Memory changed. Refresh.');
      assert(at > 0 && at <= Date.now(), 'MEMORY_TIME', 'Choose a past or current effective time.');
      assert(this.evidenceValid(winner), 'MEMORY_EVIDENCE', 'Experience evidence is missing.');
      const losers = loserIds.map((k) => this.store.get<Memory>('memory', k));
      assert(
        losers.every(
          (m) =>
            m.id !== winner.id && m.scope === winner.scope && (m.validFrom ?? m.createdAt) <= at,
        ),
        'MEMORY_SCOPE',
        'Invalid replacement scope or time.',
      );
      const remaining = this.conflicts(winner).filter((m) => !loserIds.includes(m.id));
      assert(!remaining.length, 'MEMORY_CONFLICT', 'Include all current conflicting entries.');
      for (const old of losers)
        this.record(
          old,
          {
            ...old,
            active: false,
            status: 'superseded',
            validUntil: at,
            revision: old.revision + 1,
          },
          'superseded by ' + winnerId,
        );
      return this.record(
        winner,
        {
          ...winner,
          active: true,
          status: 'active',
          validFrom: at,
          supersedes: loserIds,
          conflictsWith: [],
          revision: winner.revision + 1,
        },
        'conflict resolved by user',
      );
    });
  }
  forget(key: string) {
    return this.store.transaction(() => {
      const m = this.store.get<Memory>('memory', key);
      this.store.put('memory-forgotten', {
        id: forgottenKey(m.scope, m.content),
        scope: m.scope,
        at: Date.now(),
      });
      if (m.sourceConversationId && m.sourceEventId != null)
        this.store.put('memory-source-forgotten', {
          id: sourceKey(m.scope, m.sourceConversationId, m.sourceEventId),
          scope: m.scope,
          at: Date.now(),
        });
      for (const ref of [m.source, ...(m.sourceRefs || [])]) {
        const match = /^chat:(.+)#event:(\d+)$/.exec(ref);
        if (match)
          this.store.put('memory-source-forgotten', {
            id: sourceKey(m.scope, match[1], Number(match[2])),
            scope: m.scope,
            at: Date.now(),
          });
      }
      for (const edge of this.store.list<any>('knowledge-edge'))
        if (
          edge.scope === m.scope &&
          edge.evidence.some((e: any) => e.type === 'memory' && e.id === m.id)
        ) {
          this.store.remove('knowledge-edge', edge.id);
          for (const h of this.store.list<any>('knowledge-edge-history'))
            if (h.edgeId === edge.id) this.store.remove('knowledge-edge-history', h.id);
        }
      this.store.remove('memory', key);
      this.store.remove('memory-vector', key);
      for (const h of this.store.list<any>('memory-history'))
        if (h.memoryId === key) this.store.remove('memory-history', h.id);
      return { ok: true, sourceExcluded: !!m.sourceConversationId };
    });
  }
  undo(key: string, historyId: string) {
    return this.store.transaction(() => {
      const h = this.store.get<any>('memory-history', historyId),
        current = this.store.get<Memory>('memory', key);
      assert(
        h.memoryId === key && h.before && h.after.revision === current.revision,
        'UNDO_STALE',
        'Only the latest edit can be undone.',
      );
      assert(
        !h.reason.startsWith('superseded') &&
          !h.reason.startsWith('conflict resolved') &&
          !h.reason.startsWith('consolidated'),
        'UNDO_GROUP',
        'Replacement involves multiple records; explicitly resolve again instead.',
      );
      const prior = { ...h.before, revision: current.revision + 1 };
      if (prior.active)
        assert(
          !this.conflicts(prior).length && this.evidenceValid(prior),
          'MEMORY_CONFLICT',
          'Cannot restore conflicting or unsupported memory.',
        );
      return this.record(current, prior, 'undo');
    });
  }
  consolidate(scope: string) {
    return this.store.transaction(() => {
      const groups = new Map<string, Memory[]>();
      for (const m of this.store
        .list<Memory>('memory')
        .filter((m) => m.scope === scope && memoryValid(m))) {
        const key = JSON.stringify([
          normalizedMemory(m.content),
          m.entityId || '',
          m.attribute || '',
          m.kind || 'preference',
        ]);
        groups.set(key, [...(groups.get(key) || []), m]);
      }
      let merged = 0;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        const [primary, ...duplicates] = group;
        const sourceRefs = [...new Set(group.flatMap((m) => [m.source, ...(m.sourceRefs || [])]))];
        this.record(
          primary,
          { ...primary, sourceRefs, revision: primary.revision + 1 },
          'consolidated duplicate sources',
        );
        for (const old of duplicates)
          this.record(
            old,
            {
              ...old,
              active: false,
              status: 'superseded',
              validUntil: Date.now(),
              duplicateOf: primary.id,
              revision: old.revision + 1,
            },
            'superseded duplicate',
          );
        merged += duplicates.length;
      }
      return { merged, issues: this.inspect(scope) };
    });
  }
  inspect(scope: string) {
    const entries = this.store.list<Memory>('memory').filter((m) => m.scope === scope);
    return entries
      .map((m) => ({
        id: m.id,
        expired: !!m.expiresAt && m.expiresAt <= Date.now(),
        missingSource:
          !!m.sourceConversationId &&
          !this.store.events(m.sourceConversationId).some((e) => e.id === m.sourceEventId),
        conflicts: this.conflicts(m).map((x) => x.id),
        duplicates: entries
          .filter(
            (x) => x.id !== m.id && normalizedMemory(x.content) === normalizedMemory(m.content),
          )
          .map((x) => x.id),
      }))
      .filter((x) => x.expired || x.missingSource || x.conflicts.length || x.duplicates.length);
  }
}
