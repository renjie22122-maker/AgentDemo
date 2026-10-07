import { createHash } from 'node:crypto';
import type { Run } from '../../shared/types.js';
import { Store, id } from '../storage/store.js';
import { TaskBoard, rootRun, type BoardTask } from './task-board.js';
import { sameStamp, stamp } from './verification.js';
import { verificationPaths } from './verification-inputs.js';
import type { FileScope } from './paths.js';
import { assert } from '../core/errors.js';
import { resultSucceeded } from '../core/tool-outcome.js';
export interface TaskChallenge {
  id: string;
  root: string;
  taskId: string;
  raisedBy: string;
  claim: string;
  counterexample: string;
  status: 'open' | 'resolved';
  revision: number;
  createdAt: number;
  evidenceAfterEventId?: number;
  resolution?: {
    runId: string;
    eventId: number;
    note: string;
    contract: string;
    stamp: import('./verification.js').ArtifactStamp;
    independent: boolean;
  };
}
const contract = (t: BoardTask) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        t.title,
        t.acceptance,
        verificationPaths(t),
        t.dependsOn,
        t.requireIndependent,
      ]),
    )
    .digest('hex');
export class TaskChallenges {
  constructor(private store: Store) {}
  list(run: Run) {
    const root = rootRun(this.store, run),
      board = new TaskBoard(this.store).get(run);
    return this.store
      .list<TaskChallenge>('task-challenge')
      .filter((c) => c.root === root)
      .map((c) => {
        const task = board.tasks.find((t) => t.id === c.taskId);
        const stale =
          !!c.resolution &&
          (!task ||
            c.resolution.contract !== contract(task) ||
            task.verification?.status !== 'checked' ||
            !sameStamp(c.resolution.stamp, task.verification.stamp));
        return { ...c, status: stale ? ('open' as const) : c.status, stale };
      });
  }
  raise(run: Run, taskId: string, revision: number, claim: string, counterexample: string) {
    const board = new TaskBoard(this.store).get(run);
    assert(
      board.revision === revision && board.tasks.some((t) => t.id === taskId),
      'PLAN_CHANGED',
      'Read current task board first.',
    );
    const existing = this.list(run).find(
      (c) =>
        c.taskId === taskId && c.raisedBy === run.id && c.claim === claim && c.status === 'open',
    );
    if (existing) return existing;
    const row: TaskChallenge = {
      id: id(),
      root: board.id,
      taskId,
      raisedBy: run.id,
      claim,
      counterexample,
      status: 'open',
      revision: 1,
      createdAt: Date.now(),
      evidenceAfterEventId: (
        this.store.db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM events').get() as any
      ).n,
    };
    this.store.put('task-challenge', row);
    this.store.event(run.conversationId, run.id, 'task.challenge', {
      id: row.id,
      taskId,
      action: 'raised',
    });
    return row;
  }
  async resolve(
    run: Run,
    files: FileScope,
    key: string,
    revision: number,
    eventId: number,
    note: string,
  ) {
    const row = this.list(run).find((c) => c.id === key),
      board = new TaskBoard(this.store).get(run);
    assert(
      row && row.revision === revision,
      'CHALLENGE_CHANGED',
      'Inspect current challenge first.',
    );
    const task = board.tasks.find((t) => t.id === row.taskId);
    assert(
      task?.verification?.status === 'checked',
      'CHALLENGE_CHECK',
      'Record current artifact verification before resolving a challenge.',
    );
    assert(
      task.evidence.includes(eventId) &&
        task.verification.eventId === eventId &&
        eventId > (row.evidenceAfterEventId ?? Number.MAX_SAFE_INTEGER),
      'CHALLENGE_EVIDENCE',
      'Cite the current task verification check executed after this challenge was recorded. Legacy challenges without a checkpoint require a new challenge.',
    );
    const event = this.store.db
      .prepare('SELECT run_id,type,data FROM events WHERE id=?')
      .get(eventId) as any;
    assert(
      event?.type === 'tool.completed' && event.run_id,
      'CHALLENGE_EVIDENCE',
      'Cite a recorded tool check.',
    );
    assert(
      rootRun(this.store, this.store.get<Run>('run', event.run_id)) === board.id,
      'CHALLENGE_SCOPE',
      'Check belongs to another task tree.',
    );
    const data = JSON.parse(event.data);
    const current = await stamp(files, verificationPaths(task));
    assert(
      resultSucceeded(data) &&
        data.verification?.passed &&
        sameStamp(data.verification.before, current) &&
        sameStamp(data.verification.after, current) &&
        sameStamp(task.verification.stamp, current),
      'CHALLENGE_STALE',
      'Check must be successful and match current artifacts.',
    );
    const latest = this.store.get<TaskChallenge>('task-challenge', key);
    assert(
      latest.revision === revision &&
        new TaskBoard(this.store).get(run).revision === board.revision,
      'CHALLENGE_CHANGED',
      'State changed while checking; inspect again.',
    );
    const { stale, ...base } = row;
    const resolved: TaskChallenge = {
      ...base,
      status: 'resolved',
      revision: revision + 1,
      resolution: {
        runId: run.id,
        eventId,
        note,
        contract: contract(task),
        stamp: current,
        independent: event.run_id !== task.owner && event.run_id !== row.raisedBy,
      },
    };
    this.store.put('task-challenge', resolved);
    this.store.event(run.conversationId, run.id, 'task.challenge', {
      id: key,
      taskId: row.taskId,
      action: 'resolved',
      independent: resolved.resolution!.independent,
    });
    return resolved;
  }
}
