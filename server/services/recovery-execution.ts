import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ToolContext } from '../tools/registry.js';
import { assert, errorMessage } from '../core/errors.js';
import { id } from '../storage/store.js';
import { stamp, sameStamp, Verification } from './verification.js';
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
  const seconds = Number(call.arguments.timeoutSeconds ?? 60);
  assert(
    Number.isFinite(seconds) && seconds > 0 && seconds <= 120,
    'RECOVERY_TIMEOUT',
    'Recovery commands must use a timeout of at most 120 seconds.',
  );
  return {
    name: call.name,
    arguments: {
      ...call.arguments,
      timeoutSeconds: seconds,
      background: false,
      yieldAfterSeconds: 0,
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
export async function executeRecovery(c: ToolContext, key: string) {
  const r = c.store.get<any>('recovery-action', key);
  assert(
    r.runId === c.run.id && r.conversationId === c.run.conversationId,
    'RECOVERY_SCOPE',
    'Recovery belongs to another run.',
  );
  if (r.status !== 'prepared') return { ...r, reused: true };
  assert(c.invokeTool, 'RECOVERY_EXECUTOR', 'Use the normal audited tool executor.');
  assert(
    Date.now() <= r.expiresAt && r.scope === scope(c),
    'RECOVERY_STALE',
    'Recovery expired or workspace changed.',
  );
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
  const checkedBefore = new Set(
    new TaskBoard(c.store)
      .get(c.run)
      .tasks.filter((t) => t.verification?.status === 'checked')
      .map((t) => t.id),
  );
  const claimed = c.store.transaction(() => {
    assert(
      !c.store
        .list<any>('recovery-action')
        .some((x) => x.runId === c.run.id && x.id !== key && x.status === 'executing'),
      'RECOVERY_BUSY',
      'Another recovery is still executing.',
    );
    const current = c.store.get<any>('recovery-action', key);
    if (current.status !== 'prepared') return false;
    c.store.put('recovery-action', { ...r, status: 'executing' });
    c.store.event(c.run.conversationId, c.run.id, 'recovery.action_started', { id: key });
    return true;
  });
  if (!claimed) return { ...c.store.get<any>('recovery-action', key), reused: true };
  let result: any;
  try {
    const action = await c.invokeTool(r.action.name, r.action.arguments, 0);
    result = {
      ...r,
      actionEventId: action.eventId,
      status: action.outcome?.status === 'unknown' ? 'unknown' : 'ineffective',
    };
    if (
      action.outcome?.status === 'succeeded' &&
      !c.store.unknownEffects(c.run.conversationId).length
    ) {
      const check = await c.invokeTool(r.check.name, r.check.arguments, 1);
      const matched =
        check.outcome?.status === 'succeeded' &&
        (!r.check.contains || check.content.includes(r.check.contains));
      result = {
        ...result,
        checkEventId: check.eventId,
        postconditionObserved: matched,
        status:
          check.outcome?.status === 'unknown' ? 'unknown' : matched ? 'productive' : 'ineffective',
      };
    }
    await new Verification(c.store).refresh(c.run, c.files);
    const stale = new TaskBoard(c.store)
      .get(c.run)
      .tasks.filter((t) => t.verification?.status === 'stale' && checkedBefore.has(t.id))
      .map((t) => t.id);
    if (result.status !== 'unknown' && stale.length)
      result = { ...result, status: 'regressed', staleTasks: stale };
  } catch (error) {
    result = { ...r, status: 'unknown', error: errorMessage(error) };
  }
  result = {
    ...result,
    resolved: false,
    causalClaim: false,
    meaning:
      'Observed predicate only, not semantic correctness. Existing delivery gates still apply. No automatic replay or rollback.',
  };
  c.store.put('recovery-action', result);
  c.store.event(c.run.conversationId, c.run.id, 'recovery.action_assessed', result);
  return result;
}
