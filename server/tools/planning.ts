import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { TaskBoard, taskInput } from '../services/task-board.js';
export function installPlanning(registry: ToolRegistry) {
  registry.add({
    name: 'inspect_plan',
    effect: 'read',
    description:
      'Read the shared task board, revision, ownership and recent tool-result event IDs. Optional for simple tasks.',
    schema: z.object({}),
    run: async (_a, c) => ({
      content: JSON.stringify({
        board: new TaskBoard(c.store).get(c.run),
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
