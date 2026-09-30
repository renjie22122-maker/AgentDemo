import { Verification } from '../services/verification.js';
import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { TaskBoard, taskInput, rootRun } from '../services/task-board.js';
export function installPlanning(registry: ToolRegistry) {
  registry.add({
    name: 'inspect_team',
    effect: 'read',
    description: 'List related members, lifecycle status, owned tasks and unresolved effects.',
    schema: z.object({}),
    run: async (_a, c) => ({
      content: JSON.stringify({
        members: new TaskBoard(c.store).members(c.run),
        handoffs: c.store
          .list<any>('task-handoff')
          .filter((h) => h.boardId === rootRun(c.store, c.run)),
      }),
    }),
  });
  registry.add({
    name: 'handoff_task',
    effect: 'coordinate',
    description:
      'Lead explicitly reassigns an unfinished task after its previous owner exits. Unknown effects block handoff. No operation is replayed or worker started.',
    schema: z.object({
      id: z.string(),
      revision: z.number().int().min(0),
      targetRunId: z.string(),
      reason: z.string().min(1).max(2000),
    }),
    run: async (a, c) => {
      const board = new TaskBoard(c.store).handoff(
        c.run,
        a.id,
        a.revision,
        a.targetRunId,
        a.reason,
      );
      let notified = true;
      try {
        c.team.message(
          c.run,
          a.targetRunId,
          'Task handoff: ' +
            a.id +
            '. Inspect the shared plan and existing work before continuing. ' +
            a.reason,
        );
      } catch {
        notified = false;
      }
      return { content: JSON.stringify({ board, notified }) };
    },
  });
  registry.add({
    name: 'record_verification',
    effect: 'coordinate',
    description:
      'Bind a done task to a successful command/read event and unchanged declared artifacts. This confirms observation and version, not semantic correctness or independent review.',
    schema: z.object({
      id: z.string(),
      revision: z.number().int().min(0),
      eventId: z.number().int().positive(),
    }),
    run: async (a, c) => ({
      content: JSON.stringify(
        await new Verification(c.store).record(c.run, c.files, a.id, a.revision, a.eventId),
      ),
    }),
  });

  registry.add({
    name: 'inspect_plan',
    effect: 'read',
    description:
      'Read the shared task board, revision, ownership and recent tool-result event IDs. Optional for simple tasks.',
    schema: z.object({}),
    run: async (_a, c) => ({
      content: JSON.stringify({
        board: await new Verification(c.store).refresh(c.run, c.files),
        recentEvidence: c.store
          .events(c.run.conversationId)
          .filter((e) => e.runId === c.run.id && e.type === 'tool.completed')
          .slice(-20)
          .map((e) => ({ id: e.id, tool: e.data.name, output: e.data.output.slice(0, 400) })),
      }),
    }),
  });
  registry.add({
    name: 'create_plan',
    effect: 'coordinate',
    description:
      'Lead creates a shared DAG for a genuinely multi-step task, with explicit acceptance criteria. No automatic spawning or approvals. Plain questions need no plan.',
    schema: z.object({
      revision: z.number().int().min(0),
      tasks: z.array(taskInput).min(1).max(50),
    }),
    run: async (a, c) => ({
      content: JSON.stringify(new TaskBoard(c.store).create(c.run, a.tasks, a.revision)),
    }),
  });
  registry.add({
    name: 'update_task',
    effect: 'coordinate',
    description:
      'Claim or update a shared task using the latest board revision. Only owner or lead can update it. Done requires tool-result evidence IDs; this records an author claim, not independent verification.',
    schema: z.object({
      id: z.string(),
      revision: z.number().int().min(0),
      status: z.enum(['pending', 'running', 'done', 'blocked']),
      evidence: z.array(z.number().int().positive()).max(30).default([]),
      note: z.string().max(2000).default(''),
    }),
    run: async (a, c) => ({
      content: JSON.stringify(
        new TaskBoard(c.store).update(c.run, a.id, a.revision, a.status, a.evidence, a.note),
      ),
    }),
  });
}
