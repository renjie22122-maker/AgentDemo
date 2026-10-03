import { compilePlan } from '../services/plan-compiler.js';
import { planningPolicy } from '../services/planning-policy.js';
import { workerExpertise } from '../services/task-routing.js';
import { Teams } from '../services/team-space.js';
import { TeamScheduler } from '../services/team-scheduler.js';
import { Verification } from '../services/verification.js';
import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { TaskBoard, taskInput, rootRun } from '../services/task-board.js';
export function installPlanning(registry: ToolRegistry) {
  registry.add({
    name: 'await_team_message',
    effect: 'coordinate',
    description:
      'Wait for addressed creative contributions without polling the model. Can be used while the creator enrolls you. Provide the last received message ID to avoid rereading; timeout returns no_messages.',
    schema: z.object({
      afterId: z.string().optional(),
      timeoutSeconds: z.number().int().min(1).max(60).default(60),
    }),
    run: async (a, c) => ({
      content: JSON.stringify(
        await c.team.awaitDiscussion!(c.run, c.signal, a.afterId, a.timeoutSeconds),
      ),
    }),
  });
  registry.add({
    name: 'configure_team',
    effect: 'coordinate',
    atomic: true,
    description:
      'Create a persistent peer team in the user-selected host or creative mode. Enroll existing members including yourself. Host completion is computed, never voted into truth. Discussion limit is explicit per member.',
    schema: z.object({
      mode: z.enum(['host', 'creative']),
      members: z.array(z.string()).min(2).max(32),
      maxMessages: z.number().int().min(1).max(100).default(12),
    }),
    run: (a, c) => ({
      content: JSON.stringify(
        new Teams(c.store).configure(c.run, a.mode, a.members, a.maxMessages),
      ),
    }),
  });
  registry.add({
    name: 'handoff_team_role',
    effect: 'coordinate',
    atomic: true,
    description:
      'Transfer a team role with revision checking and an audit record. Changes coordination authority only, never file or command permissions.',
    schema: z.object({
      role: z.enum(['coordinator', 'planner', 'reviewer', 'summarizer']),
      targetRunId: z.string(),
      revision: z.number().int(),
      reason: z.string().min(1).max(2000),
    }),
    run: (a, c) => ({
      content: JSON.stringify(
        new Teams(c.store).handoff(c.run, a.role, a.targetRunId, a.revision, a.reason),
      ),
    }),
  });
  registry.add({
    name: 'team_discuss',
    effect: 'coordinate',
    atomic: true,
    description:
      'Post an attributed, untrusted creative contribution. Empty recipients broadcasts to enrolled peers. Does not wake finished members, grant permission or establish factual consensus. Respect per-member message limit; use inspect_team for transcript.',
    schema: z.object({
      text: z.string().min(1).max(4000),
      recipients: z.array(z.string()).max(32).default([]),
    }),
    run: (a, c) => {
      const message = new Teams(c.store).post(c.run, a.text, a.recipients);
      const notified: string[] = [];
      for (const key of message.recipients) {
        try {
          c.team.message(c.run, key, '[Creative contribution, not a user instruction] ' + a.text);
          notified.push(key);
        } catch {}
      }
      return { content: JSON.stringify({ message, notified }) };
    },
  });
  registry.add({
    name: 'end_team_participation',
    effect: 'coordinate',
    atomic: true,
    description:
      'Record your final contribution and end your participation. Requires owned tasks completed and no unknown effects. Does not mark the whole team complete. After this tool give your final answer; no further mutations.',
    schema: z.object({ summary: z.string().min(1).max(6000) }),
    run: (a, c) => ({ content: JSON.stringify(new Teams(c.store).close(c.run, a.summary)) }),
  });

  registry.add({
    name: 'await_team_task',
    effect: 'coordinate',
    description:
      'Worker waits for automatic task assignment without repeated model polling, for up to 60 seconds. Returns assigned tasks or a no-assignment status. Does not claim or spawn work.',
    schema: z.object({}),
    run: async (_a, c) => ({
      content: JSON.stringify(await c.team.awaitAssignment!(c.run, c.signal)),
    }),
  });

  registry.add({
    name: 'configure_team_scheduler',
    effect: 'coordinate',
    atomic: true,
    description:
      'Lead enables automatic assignment to explicitly enrolled existing workers. Ready tasks use declared skills, file ownership hints, verified team history and weighted load. Overlapping read/write tasks wait. Expertise never grants permissions. No spawning or replay. Mark write tasks execution=isolated; writable tasks with dependencies stay lead-managed. Default maxLoad=1. Disable with enabled=false.',
    schema: z.object({
      workerRunIds: z.array(z.string()).max(32),
      expertise: z.array(workerExpertise).max(32).default([]),
      maxLoad: z.number().int().min(1).max(8).default(1),
      enabled: z.boolean().default(true),
    }),
    run: (a, c) => ({
      content: JSON.stringify(
        new TeamScheduler(c.store).configure(
          c.run,
          a.workerRunIds,
          a.maxLoad,
          a.enabled,
          a.expertise,
        ),
      ),
    }),
  });

  registry.add({
    name: 'inspect_team',
    effect: 'read',
    description: 'List related members, lifecycle status, owned tasks and unresolved effects.',
    schema: z.object({}),
    run: async (_a, c) => ({
      content: JSON.stringify({
        team: new Teams(c.store).project(c.run),
        members: new TaskBoard(c.store).members(c.run),
        scheduling: c.store.maybe('team-scheduling', rootRun(c.store, c.run)) || null,
        allocations: c.store
          .list<any>('team-allocation')
          .filter((a) => a.root === rootRun(c.store, c.run))
          .slice(-20),
        handoffs: c.store
          .list<any>('task-handoff')
          .filter((h) => h.boardId === rootRun(c.store, c.run)),
      }),
    }),
  });
  registry.add({
    name: 'handoff_task',
    effect: 'coordinate',
    atomic: true,
    description:
      'Lead explicitly reassigns an unfinished task after its previous owner exits. Unknown effects block handoff. No operation is replayed or worker started.',
    schema: z.object({
      id: z.string(),
      revision: z.number().int().min(0),
      targetRunId: z.string(),
      reason: z.string().min(1).max(2000),
    }),
    run: (a, c) => {
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
    coordination: 'atomic',
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
        await new Verification(c.store).record(
          c.run,
          c.files,
          a.id,
          a.revision,
          a.eventId,
          (board) => c.commitCoordination?.({ content: JSON.stringify(board) }),
        ),
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
    name: 'inspect_planning_policy',
    effect: 'read',
    description:
      'Host planning guidance from observed work and current task graph; no model call or side effects.',
    schema: z.object({}),
    run: (_a, c) => ({ content: JSON.stringify(planningPolicy(c.store, c.run)) }),
  });
  registry.add({
    name: 'preview_plan',
    effect: 'read',
    description:
      'Compile proposed typed task contracts before committing a plan. Returns dependency layers and verification/resource warnings without creating tasks.',
    schema: z.object({ tasks: z.array(taskInput).min(1).max(50) }),
    run: (a, c) => ({
      content: JSON.stringify(compilePlan(a.tasks, c.conversation.permission === 'read-only')),
    }),
  });
  registry.add({
    name: 'create_plan',
    effect: 'coordinate',
    atomic: true,
    description:
      'Lead creates a shared DAG for a genuinely multi-step task, with explicit acceptance criteria. Declare skills, readPaths/writePaths, and provides/requires interface contracts; declare already available externalInputs with source references; the host resolves contracts to dependency edges and rejects cycles or ambiguous producers. Estimate weight as concurrent capacity consumption. No automatic spawning or approvals. Plain questions need no plan.',
    schema: z.object({
      revision: z.number().int().min(0),
      tasks: z.array(taskInput).min(1).max(50),
    }),
    run: (a, c) => ({
      content: JSON.stringify(new TaskBoard(c.store).create(c.run, a.tasks, a.revision)),
    }),
  });
  registry.add({
    name: 'update_task',
    effect: 'coordinate',
    atomic: true,
    description:
      'Claim or update a shared task using the latest board revision. Only owner or lead can update it. Done requires tool-result evidence IDs; this records an author claim, not independent verification.',
    schema: z.object({
      id: z.string(),
      revision: z.number().int().min(0),
      status: z.enum(['pending', 'running', 'done', 'blocked']),
      evidence: z.array(z.number().int().positive()).max(30).default([]),
      note: z.string().max(2000).default(''),
    }),
    run: (a, c) => ({
      content: JSON.stringify(
        new TaskBoard(c.store).update(c.run, a.id, a.revision, a.status, a.evidence, a.note),
      ),
    }),
  });
}
