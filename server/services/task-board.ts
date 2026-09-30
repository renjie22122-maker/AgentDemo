import { z } from 'zod';
import type { Run } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { terminal } from '../core/lifecycle.js';
import type { ArtifactStamp } from './verification.js';
import { assert } from '../core/errors.js';
export const taskInput = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  dependsOn: z.array(z.string()).max(50).default([]),
  acceptance: z.string().min(1).max(2000),
  execution: z.enum(['read-only', 'isolated']).optional(),
  weight: z.number().int().min(1).max(8).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  artifacts: z.array(z.string().min(1).max(2048)).max(30).optional(),
});
export interface BoardTask {
  id: string;
  title: string;
  dependsOn: string[];
  acceptance: string;
  status: 'pending' | 'running' | 'done' | 'blocked';
  owner: string | null;
  evidence: number[];
  note: string;
  execution?: 'read-only' | 'isolated';
  weight?: number;
  priority?: number;
  artifacts?: string[];
  verification?: {
    status: 'checked' | 'stale';
    eventId: number;
    checkedBy: string;
    stamp: ArtifactStamp;
  };
}
export interface Board {
  id: string;
  revision: number;
  tasks: BoardTask[];
}
export function rootRun(store: Store, run: Run): string {
  const seen = new Set<string>();
  while (run.parentRunId) {
    assert(!seen.has(run.id), 'TEAM_CYCLE', 'Corrupt run ancestry.');
    seen.add(run.id);
    run = store.get<Run>('run', run.parentRunId);
  }
  return run.id;
}
export class TaskBoard {
  constructor(private store: Store) {}
  get(run: Run): Board {
    const id = rootRun(this.store, run);
    return this.store.maybe<Board>('task-board', id) || { id, revision: 0, tasks: [] };
  }
  create(run: Run, input: z.infer<typeof taskInput>[], revision: number) {
    assert(
      run.id === rootRun(this.store, run),
      'PLAN_OWNER',
      'Only the lead creates the shared plan.',
    );
    return this.store.transaction(() => {
      const board = this.get(run);
      assert(board.revision === revision, 'PLAN_CHANGED', 'Read the latest plan revision.');
      assert(
        board.tasks.length === 0,
        'PLAN_EXISTS',
        'Update existing tasks rather than discarding work.',
      );
      assert(input.length > 0 && input.length <= 50, 'PLAN_SIZE', 'Use 1 to 50 tasks.');
      const ids = new Set(input.map((t) => t.id));
      assert(ids.size === input.length, 'PLAN_DUPLICATE', 'Task IDs must be unique.');
      const visited = new Set<string>();
      const visit = (key: string, trail: Set<string>) => {
        assert(ids.has(key), 'PLAN_DEPENDENCY', 'Unknown dependency: ' + key);
        assert(!trail.has(key), 'PLAN_CYCLE', 'Dependencies must form a DAG.');
        if (visited.has(key)) return;
        const next = new Set(trail).add(key);
        for (const dep of input.find((t) => t.id === key)!.dependsOn) visit(dep, next);
        visited.add(key);
      };
      for (const task of input) visit(task.id, new Set());
      return this.save({
        ...board,
        revision: board.revision + 1,
        tasks: input.map((t) => ({
          ...t,
          status: 'pending',
          owner: null,
          evidence: [],
          note: '',
        })),
      });
    });
  }
  update(
    run: Run,
    taskId: string,
    revision: number,
    status: BoardTask['status'],
    evidence: number[],
    note: string,
  ) {
    return this.store.transaction(() => {
      const board = this.get(run);
      assert(board.revision === revision, 'PLAN_CHANGED', 'Read the latest plan revision.');
      const task = board.tasks.find((t) => t.id === taskId);
      assert(task, 'TASK_MISSING', 'Task not found in this team.');
      assert(
        !task.owner || task.owner === run.id || run.id === board.id,
        'TASK_OWNER',
        'Another worker owns this task.',
      );
      if (status === 'running' || status === 'done')
        assert(
          task.dependsOn.every(
            (d) =>
              board.tasks.find((t) => t.id === d)?.status === 'done' &&
              board.tasks.find((t) => t.id === d)?.verification?.status !== 'stale',
          ),
          'TASK_DEPENDENCY',
          'Complete dependencies first.',
        );
      if (status !== 'done' && task.status === 'done')
        assert(
          !board.tasks.some(
            (t) => t.dependsOn.includes(taskId) && ['done', 'running'].includes(t.status),
          ),
          'TASK_DEPENDENTS',
          'Reopen downstream tasks first.',
        );
      if (status === 'done' || status === 'pending')
        assert(
          !this.store.unknownEffects(run.conversationId).length,
          'OUTCOME_UNKNOWN',
          'Inspect uncertain effects before completion or release.',
        );
      if (status === 'done') {
        assert(
          evidence.length > 0,
          'TASK_EVIDENCE',
          'Completion needs actual tool-result event IDs.',
        );
        for (const id of evidence) {
          const row = this.store.db
            .prepare('SELECT run_id,type,data FROM events WHERE id=?')
            .get(id) as any;
          assert(
            row?.type === 'tool.completed' && row.run_id,
            'TASK_EVIDENCE',
            'Evidence must be an existing tool result.',
          );
          const data = JSON.parse(row.data);
          assert(
            ![
              'update_task',
              'create_plan',
              'inspect_plan',
              'handoff_task',
              'inspect_team',
              'record_verification',
              'configure_team_scheduler',
              'await_team_task',
            ].includes(data.name) &&
              !String(data.output).startsWith('Tool error:') &&
              !String(data.output).startsWith('DENIED'),
            'TASK_EVIDENCE',
            'A failed tool or plan update is not completion evidence.',
          );
          assert(
            rootRun(this.store, this.store.get<Run>('run', row.run_id)) === board.id,
            'TASK_EVIDENCE_SCOPE',
            'Evidence belongs to another task tree.',
          );
        }
      }
      Object.assign(task, {
        status,
        owner: status === 'pending' ? null : task.owner || run.id,
        evidence,
        note,
        verification: undefined,
      });
      return this.save({ ...board, revision: board.revision + 1 });
    });
  }
  members(run: Run) {
    const root = rootRun(this.store, run);
    return this.store
      .runs()
      .filter((r) => rootRun(this.store, r) === root)
      .map((r) => ({
        runId: r.id,
        status: r.status,
        depth: r.depth,
        role: r.id === root ? 'lead' : 'worker',
        unresolvedEffects: this.store.unknownEffects(r.conversationId).length,
        tasks: this.get(run)
          .tasks.filter((t) => t.owner === r.id)
          .map((t) => t.id),
      }));
  }
  handoff(run: Run, taskId: string, revision: number, targetId: string, reason: string) {
    return this.store.transaction(() => {
      const board = this.get(run);
      assert(run.id === board.id, 'PLAN_OWNER', 'Only the lead can hand off tasks.');
      assert(board.revision === revision, 'PLAN_CHANGED', 'Read the latest plan revision.');
      const task = board.tasks.find((t) => t.id === taskId),
        target = this.store.get<Run>('run', targetId);
      assert(
        task && task.status !== 'done',
        'TASK_HANDOFF',
        'Only unfinished tasks can be handed off.',
      );
      assert(
        rootRun(this.store, target) === board.id && !terminal(target.status),
        'TEAM_SCOPE',
        'Target must be an active member of this team.',
      );
      if (task.owner) {
        const owner = this.store.get<Run>('run', task.owner);
        assert(
          terminal(owner.status),
          'OWNER_ACTIVE',
          'Stop or wait for the current owner before handoff.',
        );
        assert(
          !this.store.runs().some((r) => {
            let p: Run | undefined = r;
            while (p) {
              if (p.id === owner.id)
                return (
                  !terminal(r.status) || this.store.unknownEffects(r.conversationId).length > 0
                );
              p = p.parentRunId ? this.store.get<Run>('run', p.parentRunId) : undefined;
            }
            return false;
          }),
          'OUTCOME_UNKNOWN',
          'Wait for previous descendants and resolve uncertain effects first; no replay is authorized.',
        );
      }
      assert(
        task.dependsOn.every((d) =>
          board.tasks.some(
            (t) => t.id === d && t.status === 'done' && t.verification?.status !== 'stale',
          ),
        ),
        'TASK_DEPENDENCY',
        'Dependencies are not ready.',
      );
      const previous = task.owner;
      Object.assign(task, {
        owner: targetId,
        status: 'running',
        evidence: [],
        verification: undefined,
        note: reason,
      });
      board.revision++;
      this.save(board);
      this.store.put('task-handoff', {
        id: board.id + ':' + board.revision,
        boardId: board.id,
        taskId,
        previous,
        targetId,
        reason,
        at: Date.now(),
      });
      return board;
    });
  }
  private save(board: Board) {
    this.store.put('task-board', board);
    return board;
  }
}
