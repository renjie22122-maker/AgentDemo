import type { Run, Memory } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { assert } from '../core/errors.js';
import { TaskBoard } from './task-board.js';
import { Verification } from './verification.js';
import type { FileScope } from './paths.js';
import { MemoryLifecycle, memoryValid } from './memory-lifecycle.js';
import { memoryAccessible } from '../../shared/memory-scope.js';
export interface MemoryCheck {
  id: string;
  runId: string;
  memoryId: string;
  memoryRevision: number;
  conditions: string;
  lesson: string;
  status: 'pending' | 'checked' | 'not-applicable';
  taskId?: string;
  eventId?: number;
  reason?: string;
}
/** Recalled experience creates a fresh obligation, never a fresh success claim. */
export class MemoryChecks {
  constructor(private store: Store) {}
  register(
    run: Run,
    memories: Pick<Memory, 'id' | 'kind' | 'revision' | 'conditions' | 'content'>[],
  ) {
    for (const m of memories) {
      if (m.kind !== 'experience') continue;
      const id = run.id + ':' + m.id + ':' + m.revision;
      if (!this.store.maybe('memory-check', id))
        this.store.put('memory-check', {
          id,
          runId: run.id,
          memoryId: m.id,
          memoryRevision: m.revision,
          conditions: m.conditions || '',
          lesson: m.content,
          status: 'pending',
        });
    }
    return this.list(run);
  }
  list(run: Run) {
    const conversation = this.store.get<any>('conversation', run.conversationId);
    if (!conversation.memory) return [];
    return this.store
      .list<MemoryCheck>('memory-check')
      .filter((c) => {
        if (c.runId !== run.id) return false;
        const m = this.store.maybe<Memory>('memory', c.memoryId);
        const scope = conversation.projectId ? 'project:' + conversation.projectId : 'user';
        return (
          m &&
          m.scope === scope &&
          m.revision === c.memoryRevision &&
          memoryValid(m) &&
          memoryAccessible(m, run.conversationId) &&
          new MemoryLifecycle(this.store).evidenceValid(m)
        );
      })
      .map((c) => {
        const t = new TaskBoard(this.store).get(run).tasks.find((t) => t.id === c.taskId);
        return c.status === 'checked' &&
          (t?.verification?.status !== 'checked' || t.verification.eventId !== c.eventId)
          ? {
              ...c,
              status: 'pending' as const,
              reason: 'Recorded verification is stale or replaced.',
            }
          : c;
      });
  }
  async resolve(
    run: Run,
    files: FileScope,
    id: string,
    status: 'checked' | 'not-applicable',
    reason: string,
    taskId?: string,
  ) {
    await new Verification(this.store).refresh(run, files);
    const row = this.list(run).find((c) => c.id === id);
    assert(
      row,
      'MEMORY_CHECK_SCOPE',
      'Check is unavailable, changed, disabled or outside this run.',
    );
    let eventId: number | undefined;
    if (status === 'checked') {
      const t = new TaskBoard(this.store).get(run).tasks.find((t) => t.id === taskId);
      assert(
        t?.kind === 'verify' && t.status === 'done' && t.verification?.status === 'checked',
        'MEMORY_CHECK_EVIDENCE',
        'Bind a completed verify task with current artifact evidence.',
      );
      eventId = t.verification.eventId;
      const event = this.store.db
        .prepare('SELECT run_id FROM events WHERE id=?')
        .get(eventId) as any;
      assert(
        event?.run_id === run.id,
        'MEMORY_CHECK_EVIDENCE',
        'Use a check executed by this run, not historical evidence.',
      );
    }
    const next = { ...row, status, reason, taskId, eventId };
    this.store.put('memory-check', next);
    this.store.event(run.conversationId, run.id, 'memory.check-outcome', {
      id,
      memoryId: row.memoryId,
      status,
      taskId,
      eventId,
      reason,
      authority: 'model-reported applicability; check receipt is not semantic proof',
    });
    return next;
  }
}
