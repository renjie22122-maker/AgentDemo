import type { Conversation, Run } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { assert } from '../core/errors.js';
import { terminal } from '../core/lifecycle.js';
import { TaskBoard, rootRun } from './task-board.js';
export interface SchedulingPolicy {
  id: string;
  enabled: boolean;
  workers: string[];
  maxLoad: number;
}
export class TeamScheduler {
  constructor(private store: Store) {}
  configure(lead: Run, workers: string[], maxLoad: number, enabled: boolean) {
    const root = rootRun(this.store, lead);
    assert(lead.id === root, 'PLAN_OWNER', 'Only the lead configures automatic assignment.');
    const conversation = this.store.get<Conversation>('conversation', lead.conversationId);
    assert(
      !enabled || conversation.teamStrategy !== 'off',
      'DELEGATION_DISABLED',
      'User disabled teamwork.',
    );
    assert(
      Number.isInteger(maxLoad) && maxLoad >= 1 && maxLoad <= 8,
      'SCHEDULER_LOAD',
      'Worker load must be between 1 and 8.',
    );
    assert(
      workers.length <= 32 && new Set(workers).size === workers.length,
      'SCHEDULER_WORKERS',
      'Choose distinct team members.',
    );
    for (const id of workers) {
      const run = this.store.get<Run>('run', id);
      assert(
        id !== root && rootRun(this.store, run) === root && !terminal(run.status),
        'TEAM_SCOPE',
        'Enroll only active members in this run tree.',
      );
    }
    return this.store.put<SchedulingPolicy>('team-scheduling', {
      id: root,
      enabled,
      workers,
      maxLoad,
    });
  }
  dispatch(caller: Run) {
    const root = rootRun(this.store, caller);
    return this.store.transaction(() => {
      const policy = this.store.maybe<SchedulingPolicy>('team-scheduling', root);
      const lead = this.store.get<Run>('run', root);
      if (
        !policy?.enabled ||
        terminal(lead.status) ||
        this.store.get<Conversation>('conversation', lead.conversationId).teamStrategy === 'off'
      )
        return [];
      const board = new TaskBoard(this.store).get(lead),
        assignments: { taskId: string; runId: string; title: string; acceptance: string }[] = [];
      const candidates = policy.workers
        .map((id) => this.store.get<Run>('run', id))
        .filter(
          (r) =>
            (['queued', 'running'].includes(r.status) ||
              (r.status === 'waiting_children' && !!this.store.maybe('team-worker-ready', r.id))) &&
            !r.recoveryOnly &&
            !this.store.unknownEffects(r.conversationId).length,
        );
      const load = (id: string) =>
        board.tasks
          .filter((t) => t.owner === id && ['running', 'blocked'].includes(t.status))
          .reduce((n, t) => n + (t.weight || 1), 0);
      const completed = (id: string) =>
        board.tasks.filter((t) => t.owner === id && t.status === 'done').length;
      const ready = board.tasks
        .filter(
          (t) =>
            t.status === 'pending' &&
            !t.owner &&
            t.dependsOn.every((d) =>
              board.tasks.some(
                (p) => p.id === d && p.status === 'done' && p.verification?.status !== 'stale',
              ),
            ),
        )
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id.localeCompare(b.id));
      for (const task of ready) {
        const eligible = candidates
          .filter((r) => {
            const c = this.store.get<Conversation>('conversation', r.conversationId);
            if (load(r.id) + (task.weight || 1) > policy.maxLoad) return false;
            if (task.execution === 'isolated') {
              // Copy contents can become stale after predecessor work. Integration stays lead-managed.
              return !task.dependsOn.length && !!c.isolationId && c.permission !== 'read-only';
            }
            return true;
          })
          .sort(
            (a, b) =>
              load(a.id) - load(b.id) ||
              completed(a.id) - completed(b.id) ||
              a.createdAt - b.createdAt ||
              a.id.localeCompare(b.id),
          );
        const member = eligible[0];
        if (!member) continue;
        task.owner = member.id;
        task.status = 'running';
        task.note = 'Automatically assigned by ready-task scheduler.';
        assignments.push({
          taskId: task.id,
          runId: member.id,
          title: task.title,
          acceptance: task.acceptance,
        });
      }
      if (assignments.length) {
        board.revision++;
        this.store.put('task-board', board);
        this.store.put('team-allocation', {
          id: root + ':' + board.revision,
          root,
          revision: board.revision,
          assignments,
          at: Date.now(),
        });
      }
      return assignments;
    });
  }
}
