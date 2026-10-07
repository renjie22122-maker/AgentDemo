import { createHash } from 'node:crypto';
import type { Store } from '../storage/store.js';
import type { Run } from '../../shared/types.js';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function recoveryStrategyKey(record: any) {
  const args = { ...record.action.arguments };
  // Explanation wording is not a different operation. Timeout stays part of the strategy.
  if (record.action.name === 'run_command') delete args.reason;
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          scope: record.scope,
          before: record.before,
          action: { name: record.action.name, arguments: args },
        }),
      ),
    )
    .digest('hex');
}
function observed(store: Store, r: any, phase: 'action' | 'check') {
  const jobId = r[phase + 'JobId'];
  if (jobId) {
    const job = store.maybe<any>('command-job', jobId);
    if (
      job?.runId !== r.runId ||
      !job.result ||
      job.notStarted ||
      !['completed', 'failed'].includes(job.status)
    )
      return undefined;
    return job.result.code === 0 && !job.result.timedOut && !job.result.aborted
      ? 'succeeded'
      : 'failed';
  }
  const row = store.db
    .prepare('SELECT run_id,type,data FROM events WHERE id=?')
    .get(r[phase + 'EventId'] ?? -1) as any;
  if (!row || row.run_id !== r.runId || row.type !== 'tool.completed') return undefined;
  const data = JSON.parse(row.data);
  if (data.name !== r[phase].name) return undefined;
  if (data.outcome?.status === 'succeeded') return 'succeeded';
  if (data.outcome?.status === 'failed' && data.outcome.executionStarted === true) return 'failed';
  return undefined;
}
export function recoveryPolicyFeedback(store: Store, run: Run) {
  const rows = store.list<any>('recovery-action').filter((r) => r.runId === run.id);
  return rows
    .filter((r) => ['productive', 'ineffective', 'regressed'].includes(r.status))
    .slice(-3)
    .map((r) => {
      const action = observed(store, r, 'action'),
        check = observed(store, r, 'check');
      const grounded = action === 'failed' || (action === 'succeeded' && !!check);
      return {
        id: r.id,
        status: r.status,
        grounded,
        strategyKey: grounded ? recoveryStrategyKey(r) : undefined,
        recommendation: !grounded
          ? 'inspect-missing-evidence'
          : r.status === 'productive'
            ? 'retain-as-observed-option'
            : 'change-strategy-or-establish-changed-preconditions',
        actionEventId: r.actionEventId,
        checkEventId: r.checkEventId,
        actionJobId: r.actionJobId,
        checkJobId: r.checkJobId,
        causalClaim: false,
        counterfactual: 'unobserved',
        limitation:
          'Outcome association only. No control trial or proof that this action caused the result. Never bypass permissions or replay unknown outcomes.',
      };
    });
}
