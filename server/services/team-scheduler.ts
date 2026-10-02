import { adaptiveRouting, startTaskMeasurement } from './routing-outcomes.js';
import {
  resourceConflict,
  routingScore,
  workerExpertise,
  type WorkerExpertise,
} from './task-routing.js';
import { Teams } from './team-space.js';
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
  expertise?: WorkerExpertise[];
}
export class TeamScheduler {
  constructor(private store: Store) {}
  configure(
    lead: Run,
    workers: string[],
    maxLoad: number,
    enabled: boolean,
    expertise: WorkerExpertise[] = [],
  ) {
    const root = rootRun(this.store, lead);
    assert(
      new Teams(this.store).authority(lead),
      'PLAN_OWNER',
      'Only the lead configures automatic assignment.',
    );
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
    expertise = expertise.map((p) => workerExpertise.parse(p));
    assert(
      new Set(expertise.map((p) => p.runId)).size === expertise.length &&
        expertise.every((p) => workers.includes(p.runId)),
      'SCHEDULER_PROFILE',
      'Expertise must name distinct enrolled members.',
    );
    return this.store.put<SchedulingPolicy>('team-scheduling', {
      id: root,
      enabled,
      workers,
      maxLoad,
      expertise,
    });
  }
  dispatch(caller: Run) {
    const root = rootRun(this.store, caller);
    return this.store.transaction(() => {
      const policy = this.store.maybe<SchedulingPolicy>('team-scheduling', root);
      const lead = this.store.get<Run>('run', root);
      if (
        !policy?.enabled ||
        (terminal(lead.status) && new Teams(this.store).get(lead)?.mode !== 'host') ||
        this.store.get<Conversation>('conversation', lead.conversationId).teamStrategy === 'off'
      )
        return [];
      const board = new TaskBoard(this.store).get(lead),
        assignments: {
          taskId: string;
          runId: string;
          title: string;
          acceptance: string;
          routing?: unknown;
        }[] = [];
      const candidates = policy.workers
        .map((id) => this.store.get<Run>('run', id))
        .filter(
          (r) =>
            (['queued', 'running'].includes(r.status) ||
              (r.status === 'waiting_children' && !!this.store.maybe('team-worker-ready', r.id))) &&
            (!new Teams(this.store).get(lead) ||
              (new Teams(this.store).get(lead)!.members.includes(r.id) &&
                !new Teams(this.store).get(lead)!.closed[r.id])) &&
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
      const blocked = ready
        .filter((t) => (t.weight || 1) > policy.maxLoad)
        .map((t) => ({
          taskId: t.id,
          reason: 'Task weight exceeds configured per-worker capacity',
          weight: t.weight,
          maxLoad: policy.maxLoad,
        }));

      for (const task of ready) {
        const conflict = board.tasks.find(
          (t) =>
            t.id !== task.id &&
            ['running', 'blocked'].includes(t.status) &&
            resourceConflict(task, t),
        );
        if (conflict) {
          blocked.push({
            taskId: task.id,
            reason: 'File access overlaps active task ' + conflict.id,
            weight: task.weight,
            maxLoad: policy.maxLoad,
          });
          continue;
        }
        const scores = new Map<string, any>();
        const score = (id: string) => {
          if (scores.has(id)) return scores.get(id);
          const base = routingScore(
            task,
            policy.expertise?.find((p) => p.runId === id),
            board.tasks.filter((t) => t.owner === id),
            load(id),
          );
          const empirical = adaptiveRouting(
            this.store,
            this.store.get<Run>('run', id),
            task,
            Date.now(),
            policy.expertise?.find((p) => p.runId === id),
          );
          const value = {
            ...base,
            baseScore: base.score,
            score: base.score + empirical.adjustment,
            empirical,
          };
          scores.set(id, value);
          return value;
        };

        const eligible = candidates
          .filter((r) => {
            const c = this.store.get<Conversation>('conversation', r.conversationId);
            if (load(r.id) + (task.weight || 1) > policy.maxLoad) return false;
            if (task.execution === 'isolated') {
              // Copy contents can become stale after predecessor work. Integration stays lead-managed.
              return (
                !task.dependsOn.length &&
                !!c.isolationId &&
                c.permission !== 'read-only' &&
                this.store.maybe<any>('isolation', c.isolationId)?.state === 'ready'
              );
            }
            return true;
          })
          .sort(
            (a, b) =>
              score(b.id).score - score(a.id).score ||
              load(a.id) - load(b.id) ||
              completed(a.id) - completed(b.id) ||
              a.createdAt - b.createdAt ||
              a.id.localeCompare(b.id),
          );
        const member = eligible[0];
        if (!member) {
          if (!blocked.some((b) => b.taskId === task.id))
            blocked.push({
              taskId: task.id,
              reason:
                task.execution === 'isolated' && task.dependsOn.length
                  ? 'Dependent write requires a refreshed isolated workspace; lead-managed'
                  : 'No eligible worker with sufficient capacity and permissions',
              weight: task.weight,
              maxLoad: policy.maxLoad,
            });
          continue;
        }
        const routing = {
          ...score(member.id),
          basis: 'declared expertise, scoped checked history, load and bounded measured feedback',
        };

        startTaskMeasurement(
          this.store,
          board,
          task,
          member,
          Date.now(),
          policy.expertise?.find((p) => p.runId === member.id),
        );
        task.owner = member.id;
        task.status = 'running';
        this.store.remove('team-worker-idle', member.id);
        task.note = 'Automatically assigned: ' + JSON.stringify(routing);
        assignments.push({
          taskId: task.id,
          runId: member.id,
          title: task.title,
          acceptance: task.acceptance,
          routing,
        });
      }
      this.store.put('team-scheduler-diagnostics', { id: root, blocked });
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
