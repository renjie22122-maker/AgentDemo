import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ToolContext } from '../tools/registry.js';
import { assert, errorMessage } from '../core/errors.js';
import { id } from '../storage/store.js';
import { stamp, sameStamp, Verification } from './verification.js';
import { commandOutcome } from '../core/tool-outcome.js';
import { TaskBoard } from './task-board.js';
export const recoveryContract = z.object({
  reason: z.string().min(1).max(2000),
  expected: z.string().min(1).max(2000),
  paths: z.array(z.string().min(1)).min(1).max(20),
  action: z.object({
    name: z.enum(['write_file', 'edit_file', 'run_command']),
    arguments: z.record(z.string(), z.unknown()),
  }),
  check: z.object({
    name: z.enum(['read_file', 'run_command']),
    arguments: z.record(z.string(), z.unknown()),
    contains: z.string().min(1).max(8000).optional(),
  }),
});
const scope = (c: ToolContext) =>
  createHash('sha256')
    .update(JSON.stringify([c.files.roots, c.conversation.projectId, c.conversation.isolationId]))
    .digest('hex');
function bounded(call: { name: string; arguments: Record<string, unknown> }) {
  if (call.name !== 'run_command') return call;
  const seconds = Number(call.arguments.timeoutSeconds ?? 120);
  assert(
    Number.isFinite(seconds) && seconds > 0 && Number.isInteger(seconds) && seconds <= 1800,
    'RECOVERY_TIMEOUT',
    'Recovery commands use the normal timeout range of 1–1800 seconds.',
  );
  return {
    name: call.name,
    arguments: {
      ...call.arguments,
      timeoutSeconds: seconds,
      yieldAfterSeconds: call.arguments.yieldAfterSeconds ?? 10,
    },
  };
}
export async function prepareRecovery(c: ToolContext, input: z.infer<typeof recoveryContract>) {
  assert(
    !c.store.unknownEffects(c.run.conversationId).length,
    'RECOVERY_UNKNOWN',
    'Inspect unknown effects before proposing a new world-changing recovery.',
  );
  assert(
    input.check.name !== 'read_file' || !!input.check.contains,
    'RECOVERY_CHECK',
    'A read check needs an explicit expected substring.',
  );
  const action = bounded(input.action),
    check = { ...input.check, ...bounded(input.check) };
  const before = await stamp(c.files, input.paths);
  assert(
    before.complete,
    'RECOVERY_PRECONDITION',
    'Declared precondition paths must be fully readable.',
  );
  const rows = c.store.list<any>('recovery-action').filter((r) => r.runId === c.run.id);
  assert(
    rows.length < 3,
    'RECOVERY_LIMIT',
    'At most three recovery contracts per run; retain unresolved work.',
  );
  const record = {
    id: id(),
    runId: c.run.id,
    conversationId: c.run.conversationId,
    ...input,
    action,
    check,
    before,
    scope: scope(c),
    boardRevision: new TaskBoard(c.store).get(c.run).revision,
    expiresAt: Date.now() + 10 * 60 * 1000,
    status: 'prepared',
    resolved: false,
  };
  c.store.put('recovery-action', record);
  c.store.event(c.run.conversationId, c.run.id, 'recovery.action_prepared', record);
  return record;
}

const pendingStatuses = ['executing', 'waiting-action', 'waiting-check'];
function pendingJob(c: ToolContext, result: any) {
  let parsed: any;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    return undefined;
  }
  if (!parsed?.id || parsed.runId !== c.run.id) return undefined;
  const job = c.background.get(c.run.conversationId, parsed.id);
  assert(job.runId === c.run.id, 'RECOVERY_JOB_SCOPE', 'Background job belongs to another run.');
  return job.id;
}
function jobResult(c: ToolContext, key: string) {
  const job = c.background.get(c.run.conversationId, key);
  assert(job.runId === c.run.id, 'RECOVERY_JOB_SCOPE', 'Background job belongs to another run.');
  if (['running', 'waiting_approval'].includes(job.status)) return undefined;
  return {
    content: JSON.stringify(job.result || job),
    outcome: job.result
      ? commandOutcome(job.result)
      : { status: job.status === 'unknown' ? 'unknown' : 'failed' },
  };
}
export async function executeRecovery(c: ToolContext, key: string) {
  let r = c.store.get<any>('recovery-action', key);
  assert(
    r.runId === c.run.id && r.conversationId === c.run.conversationId,
    'RECOVERY_SCOPE',
    'Recovery belongs to another run.',
  );
  const resume = r.status === 'waiting-action' || r.status === 'waiting-check';
  if (r.status !== 'prepared' && !resume) return { ...r, reused: true };
  assert(c.invokeTool, 'RECOVERY_EXECUTOR', 'Use the normal audited tool executor.');
  assert(
    r.scope === scope(c),
    'RECOVERY_STALE',
    'Recovery workspace changed; inspect the receipt.',
  );
  let settled: any;
  if (resume) {
    settled = jobResult(c, r.status === 'waiting-action' ? r.actionJobId : r.checkJobId);
    if (!settled)
      return {
        ...r,
        reused: true,
        next: 'Wait for the recorded job, then call execute_recovery_action with this ID. Do not resubmit the command.',
      };
  } else {
    assert(Date.now() <= r.expiresAt, 'RECOVERY_STALE', 'Recovery expired.');
    assert(
      !c.store.unknownEffects(c.run.conversationId).length,
      'RECOVERY_UNKNOWN',
      'Unknown effects prohibit recovery execution.',
    );
    assert(
      new TaskBoard(c.store).get(c.run).revision === r.boardRevision,
      'RECOVERY_STALE',
      'Plan changed; inspect current requirements.',
    );
    assert(
      sameStamp(r.before, await stamp(c.files, r.paths)),
      'RECOVERY_STALE',
      'Precondition files changed.',
    );
  }
  const priorStatus = r.status;
  const claimed = c.store.transaction(() => {
    const current = c.store.get<any>('recovery-action', key);
    if (current.status !== priorStatus) return false;
    assert(
      !c.store
        .list<any>('recovery-action')
        .some((x) => x.runId === c.run.id && x.id !== key && pendingStatuses.includes(x.status)),
      'RECOVERY_BUSY',
      'Another recovery is still executing.',
    );
    r = {
      ...current,
      checkedBefore:
        current.checkedBefore ||
        new TaskBoard(c.store)
          .get(c.run)
          .tasks.filter((t) => t.verification?.status === 'checked')
          .map((t) => t.id),
      status: 'executing',
    };
    c.store.put('recovery-action', r);
    c.store.event(c.run.conversationId, c.run.id, 'recovery.action_started', {
      id: key,
      resume,
      priorStatus,
    });
    return true;
  });
  if (!claimed) return { ...c.store.get<any>('recovery-action', key), reused: true };
  const save = (value: any) => {
    c.store.put('recovery-action', value);
    c.store.event(c.run.conversationId, c.run.id, 'recovery.action_assessed', value);
    return value;
  };
  const waiting = (phase: 'action' | 'check', jobId: string) =>
    save({
      ...r,
      status: 'waiting-' + phase,
      [phase + 'JobId']: jobId,
      next: 'Continue independent work. Use wait_background_command for this job, then execute_recovery_action with the same contract ID to continue verification. Never resubmit the original command.',
    });
  let result: any;
  try {
    let check: any;
    if (priorStatus === 'waiting-check') check = settled;
    else {
      const action =
        priorStatus === 'waiting-action'
          ? settled
          : await c.invokeTool(r.action.name, r.action.arguments, 0);
      if (action.eventId) r.actionEventId = action.eventId;
      if (priorStatus !== 'waiting-action') {
        const job = r.action.name === 'run_command' ? pendingJob(c, action) : undefined;
        if (job) return waiting('action', job);
      }
      if (
        action.outcome?.status !== 'succeeded' ||
        c.store.unknownEffects(c.run.conversationId).length
      ) {
        return save({
          ...r,
          status:
            action.outcome?.status === 'unknown' ||
            c.store.unknownEffects(c.run.conversationId).length
              ? 'unknown'
              : 'ineffective',
          resolved: false,
        });
      }
      c.signal.throwIfAborted();
      // A verification command is a new guarded operation, never a replay of the action.
      check = await c.invokeTool(r.check.name, r.check.arguments, 1);
      r.checkEventId = check.eventId;
      const job = r.check.name === 'run_command' ? pendingJob(c, check) : undefined;
      if (job) return waiting('check', job);
    }
    const matched =
      check.outcome?.status === 'succeeded' &&
      (!r.check.contains || check.content.includes(r.check.contains));
    result = {
      ...r,
      postconditionObserved: matched,
      status:
        check.outcome?.status === 'unknown' ? 'unknown' : matched ? 'productive' : 'ineffective',
    };
    await new Verification(c.store).refresh(c.run, c.files);
    const stale = new TaskBoard(c.store)
      .get(c.run)
      .tasks.filter((t) => t.verification?.status === 'stale' && r.checkedBefore.includes(t.id))
      .map((t) => t.id);
    if (result.status !== 'unknown' && stale.length)
      result = { ...result, status: 'regressed', staleTasks: stale };
  } catch (error) {
    result = { ...r, status: 'unknown', error: errorMessage(error) };
  }
  return save({
    ...result,
    resolved: false,
    causalClaim: false,
    meaning:
      'Observed predicate only, not semantic correctness. Existing delivery gates still apply. No automatic replay or rollback.',
  });
}
