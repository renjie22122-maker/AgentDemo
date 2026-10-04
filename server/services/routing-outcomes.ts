import { Store, id } from '../storage/store.js';
import type { Board, BoardTask } from './task-board.js';
import type { WorkerExpertise } from './task-routing.js';
import type { Run, Conversation } from '../../shared/types.js';
export interface RoutingOutcome {
  id: string;
  boardId: string;
  taskId: string;
  owner: string;
  scope: string;
  provider: string;
  specialization?: string;
  skills: string[];
  startedAt: number;
  finishedAt?: number;
  baselineUsd: number | null;
  baselineEvent: number;
  attributable: boolean;
  status: 'running' | 'awaiting_check' | 'checked' | 'blocked';
  durationMs?: number;
  estimatedUsd?: number | null;
  toolResults?: Record<string, { ok: number; failed: number }>;
}
const specialization = (p?: WorkerExpertise) =>
  p ? JSON.stringify([p.description || '', [...p.skills].sort(), [...p.paths].sort()]) : '';
const scopeFor = (c: Conversation) =>
  c.projectId ? 'project:' + c.projectId : 'conversation:' + c.id;
export function startTaskMeasurement(
  store: Store,
  board: Board,
  task: BoardTask,
  owner: Run,
  now = Date.now(),
  expertise?: WorkerExpertise,
) {
  const existing = task.attemptId
    ? store.maybe<RoutingOutcome>('routing-outcome', task.attemptId)
    : undefined;
  if (existing?.status === 'running') return;
  const siblings = store
    .list<RoutingOutcome>('routing-outcome')
    .filter((x) => x.owner === owner.id && x.status === 'running');
  for (const x of siblings) store.put('routing-outcome', { ...x, attributable: false });
  const c = store.get<Conversation>('conversation', owner.conversationId);
  task.attemptId = id();
  store.put<RoutingOutcome>('routing-outcome', {
    id: task.attemptId,
    boardId: board.id,
    taskId: task.id,
    owner: owner.id,
    scope: scopeFor(c),
    provider: owner.providerFingerprint || '',
    specialization: specialization(expertise),
    skills: task.skills || [],
    startedAt: now,
    baselineUsd: owner.estimatedUsd ?? null,
    baselineEvent: store.events(owner.conversationId).at(-1)?.id || 0,
    attributable: siblings.length === 0,
    status: 'running',
  });
}
export function finishTaskMeasurement(
  store: Store,
  task: BoardTask,
  status: 'done' | 'blocked',
  now = Date.now(),
) {
  const old = task.attemptId && store.maybe<RoutingOutcome>('routing-outcome', task.attemptId);
  if (!old || old.status !== 'running') return;
  const run = store.get<Run>('run', old.owner),
    tools: Record<string, { ok: number; failed: number }> = {};
  for (const e of store
    .events(run.conversationId)
    .filter((e) => e.id > old.baselineEvent && e.runId === run.id && e.type === 'tool.completed')) {
    if (
      ['update_task', 'record_verification', 'inspect_plan', 'await_team_task'].includes(
        e.data.name,
      )
    )
      continue;
    const typed = e.data.outcome;
    if (typed) {
      // Permission, unknown effects and preflight failures are not worker competence.
      if (!['succeeded', 'failed'].includes(typed.status)) continue;
      if (/HTTP (401|403|429|5\d\d)|ECONN|ENET|EAI_AGAIN|TIMEOUT|ABORT/i.test(typed.code || ''))
        continue;
      const count = (tools[e.data.name] ||= { ok: 0, failed: 0 });
      typed.status === 'succeeded' ? count.ok++ : count.failed++;
      continue;
    }
    const out = String(e.data.output);
    if (
      /^DENIED/.test(out) ||
      /PermissionDenied|SANDBOX_PREFLIGHT|HTTP (401|403|429|5\d\d)|ECONN|ENET|EAI_AGAIN|request.*timed out/i.test(
        out,
      )
    )
      continue;
    let failed = out.startsWith('Tool error:');
    try {
      const result = JSON.parse(out);
      if (typeof result.code === 'number') failed = result.code !== 0;
      if (result.timedOut || result.aborted) continue;
    } catch {}
    const count = (tools[e.data.name] ||= { ok: 0, failed: 0 });
    failed ? count.failed++ : count.ok++;
  }
  const cost =
    old.attributable && old.baselineUsd != null && run.estimatedUsd != null
      ? Math.max(0, run.estimatedUsd - old.baselineUsd)
      : null;
  store.put('routing-outcome', {
    ...old,
    status: status === 'done' ? 'awaiting_check' : 'blocked',
    finishedAt: now,
    durationMs: Math.max(0, now - old.startedAt),
    estimatedUsd: cost,
    toolResults: tools,
  });
}
export function adaptiveRouting(
  store: Store,
  run: Run,
  task: BoardTask,
  now = Date.now(),
  expertise?: WorkerExpertise,
) {
  const c = store.get<Conversation>('conversation', run.conversationId),
    tags = new Set((task.skills || []).map((s) => s.toLowerCase()));
  const rows = store
    .list<RoutingOutcome>('routing-outcome')
    .filter(
      (x) =>
        x.attributable &&
        x.provider &&
        x.provider === run.providerFingerprint &&
        (x.specialization || '') === specialization(expertise) &&
        x.scope === scopeFor(c) &&
        (x.finishedAt || 0) > now - 30 * 86400000 &&
        x.skills.some((s) => tags.has(s.toLowerCase())),
    )
    .filter((x) => {
      if (x.status === 'blocked')
        return Object.values(x.toolResults || {}).some((v) => v.failed > 0);
      if (x.status !== 'checked') return false;
      const current = store
        .maybe<Board>('task-board', x.boardId)
        ?.tasks.find((t) => t.id === x.taskId);
      return (
        current?.attemptId === x.id &&
        current.status === 'done' &&
        current.verification?.status === 'checked'
      );
    })
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, 50);
  const passed = rows.filter((x) => x.status === 'checked').length;
  const posterior = (passed + 2) / (rows.length + 4);
  const median = (v: number[]) => {
    v.sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const latency = median(
    rows
      .filter((x) => x.status === 'checked')
      .map((x) => x.durationMs!)
      .filter(Number.isFinite),
  );
  const cost = median(
    rows
      .map((x) => x.estimatedUsd)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x)),
  );
  // Bounded empirical adjustment; not a calibrated completion probability or an optimizer.
  const counts = rows.reduce(
    (out, x) => {
      for (const k of task.requiredTools || []) {
        const v = x.toolResults?.[k];
        if (v) {
          out.ok += v.ok;
          out.failed += v.failed;
        }
      }
      return out;
    },
    { ok: 0, failed: 0 },
  );
  const competence =
    counts.ok + counts.failed >= 5 ? (counts.ok + 1) / (counts.ok + counts.failed + 2) - 0.5 : 0;
  const adjustment =
    rows.length < 5
      ? 0
      : Math.max(
          -2,
          Math.min(
            2,
            (posterior - 0.5) * 4 +
              competence -
              (latency == null ? 0 : Math.min(0.5, latency / 1200000)) -
              (cost == null ? 0 : Math.min(0.5, cost)),
          ),
        );
  return {
    adjustment,
    requestedToolEvidence: counts,
    samples: rows.length,
    checked: passed,
    blockedWithToolFailure: rows.length - passed,
    smoothedCheckRate: rows.length ? posterior : null,
    medianDurationMs: latency,
    medianEstimatedUsd: cost,
    toolResults: rows.reduce(
      (out, x) => {
        for (const [k, v] of Object.entries(x.toolResults || {})) {
          const z = (out[k] ||= { ok: 0, failed: 0 });
          z.ok += v.ok;
          z.failed += v.failed;
        }
        return out;
      },
      {} as Record<string, { ok: number; failed: number }>,
    ),
    mode: rows.length < 5 ? 'cold-start' : 'bounded-empirical',
  };
}
