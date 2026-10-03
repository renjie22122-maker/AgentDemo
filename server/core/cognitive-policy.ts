import { createHash } from 'node:crypto';
export type Intervention =
  'none' | 'change-strategy' | 'diagnose-blocker' | 'review-plan' | 'verify' | 'stop';
export interface CognitiveState {
  version: 1;
  step: number;
  window: string[];
  warnedCycle?: string;
  lastAdvice: number;
  errorStreak: number;
  completedTasks: string[];
  noticed: string[];
  lastAdviceOutcome?: {
    action: Intervention;
    result: 'task-advanced' | 'errors-cleared' | 'trajectory-changed' | 'no-observed-change';
    afterBatches: number;
  };
  pendingAdvice?: { action: Intervention; step: number; digest: string; errors: number };
  signals: {
    repeated: boolean;
    toolErrors: number;
    blockedTasks: number;
    pendingVerification: number;
    completedTaskDelta: number;
    semanticDrift: null;
    confidence: null;
  };
}
export interface Observation {
  calls: unknown;
  outputs: string[];
  tasks: { id: string; status: string; kind?: string; verification?: { status: string } }[];
}
export interface Decision {
  state: CognitiveState;
  action: Intervention;
  reason: string;
  message?: string;
}
export const initialCognitiveState = (): CognitiveState => ({
  version: 1,
  step: 0,
  window: [],
  lastAdvice: -10,
  errorStreak: 0,
  completedTasks: [],
  noticed: [],
  signals: {
    repeated: false,
    toolErrors: 0,
    blockedTasks: 0,
    pendingVerification: 0,
    completedTaskDelta: 0,
    semanticDrift: null,
    confidence: null,
  },
});
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
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
export function cognitivePolicy(previous: CognitiveState, observation: Observation): Decision {
  const state = structuredClone(previous);
  state.step++;
  const completed = observation.tasks
    .filter((t) => t.status === 'done' && t.verification?.status !== 'stale')
    .map((t) => t.id);
  const advanced = completed.filter((id) => !state.completedTasks.includes(id)).length;
  state.completedTasks = completed;
  if (advanced) {
    state.window = [];
    state.warnedCycle = undefined;
  }
  const waitTools = new Set([
    'wait_agents',
    'wait_background_command',
    'await_team_message',
    'await_team_task',
  ]);
  const calls = Array.isArray(observation.calls) ? observation.calls : [];
  if (
    calls.length &&
    calls.every((c) => Array.isArray(c) && waitTools.has(c[0])) &&
    observation.outputs.every((o) => !o.startsWith('Tool error:') && !o.startsWith('DENIED'))
  ) {
    state.window = [];
    state.errorStreak = 0;
    state.warnedCycle = undefined;
    state.signals = {
      ...state.signals,
      repeated: false,
      toolErrors: 0,
      completedTaskDelta: advanced,
      blockedTasks: observation.tasks.filter((t) => t.status === 'blocked').length,
      pendingVerification: observation.tasks.filter(
        (t) => t.verification?.status === 'stale' || (t.kind === 'verify' && t.status !== 'done'),
      ).length,
    };
    return { state, action: 'none', reason: 'Event-driven waiting is not stagnation.' };
  }
  const trajectory = hash([observation.calls, observation.outputs]);
  state.window.push(hash([observation.calls, observation.outputs]));
  state.window = state.window.slice(-12);
  const errors = observation.outputs.filter((output, index) => {
    if (output.startsWith('Tool error:') || output.startsWith('DENIED')) return true;
    const call = Array.isArray(observation.calls) ? observation.calls[index] : undefined;
    if (!Array.isArray(call) || call[0] !== 'run_command') return false;
    try {
      const result = JSON.parse(output);
      return (
        result.timedOut === true ||
        result.aborted === true ||
        (typeof result.code === 'number' && result.code !== 0)
      );
    } catch {
      return false;
    }
  }).length;
  // Mixed successful/error batches are not a continuous total failure.
  state.errorStreak =
    observation.outputs.length > 0 && errors === observation.outputs.length
      ? state.errorStreak + 1
      : 0;
  if (state.pendingAdvice) {
    const pending = state.pendingAdvice;
    const afterBatches = state.step - pending.step;
    const failed = errors > 0;
    const result = advanced
      ? 'task-advanced'
      : pending.errors && !failed
        ? 'errors-cleared'
        : trajectory !== pending.digest
          ? 'trajectory-changed'
          : 'no-observed-change';
    state.lastAdviceOutcome = { action: pending.action, result, afterBatches };
    if (result !== 'no-observed-change' || afterBatches >= 4) state.pendingAdvice = undefined;
  }
  const blocked = observation.tasks.filter((t) => t.status === 'blocked').map((t) => t.id);
  const verification = observation.tasks
    .filter(
      (t) => t.verification?.status === 'stale' || (t.kind === 'verify' && t.status !== 'done'),
    )
    .map((t) => t.id);
  let cycle: string | undefined;
  for (let width = 1; width <= 3; width++) {
    const tail = state.window.slice(-width * 4);
    if (tail.length === width * 4 && tail.every((v, i) => v === tail[i % width])) {
      cycle = hash(tail.slice(0, width).sort());
      break;
    }
  }
  state.signals = {
    repeated: !!cycle,
    toolErrors: errors,
    blockedTasks: blocked.length,
    pendingVerification: verification.length,
    completedTaskDelta: advanced,
    semanticDrift: null,
    confidence: null,
  };
  const decision = (action: Intervention, reason: string, message?: string): Decision => {
    if (message) state.pendingAdvice = { action, step: state.step, digest: trajectory, errors };
    return { state, action, reason, message };
  };
  if (!cycle && state.window.length === 12) state.warnedCycle = undefined;
  if (state.errorStreak === 0)
    state.noticed = state.noticed.filter((k) => k !== 'consecutive-tool-errors');
  if (cycle && !advanced) {
    if (state.warnedCycle === cycle)
      return decision('stop', 'The same unchanged trajectory repeated after its warning.');
    state.warnedCycle = cycle;
    state.window = [];
    state.lastAdvice = state.step;
    return decision(
      'change-strategy',
      'Four unchanged tool trajectories.',
      'Repeated calls returned unchanged results. Change the evidence-gathering approach, use existing observations, or explain the blocker. Do not claim success without evidence or repeat unknown side effects.',
    );
  }
  if (state.step - state.lastAdvice < 4) return decision('none', 'Advice cooldown.');
  const advise = (action: Intervention, key: string, message: string) => {
    if (state.noticed.includes(key))
      return decision('none', 'This condition has already been reported.');
    state.noticed = [...state.noticed, key].slice(-32);
    state.lastAdvice = state.step;
    return decision(action, key, message);
  };
  if (state.errorStreak >= 3)
    return advise(
      'diagnose-blocker',
      'consecutive-tool-errors',
      'Several consecutive tool batches failed. Inspect the concrete errors and current capabilities before retrying. Request user help when authorization or missing information is required; do not bypass enforcement.',
    );
  if (blocked.length)
    return advise(
      'review-plan',
      'blocked:' + hash(blocked.sort()),
      'The task board has blocked work. Inspect its recorded blockers and dependencies; revise the plan only if the evidence supports a change. Do not silently drop requirements.',
    );
  const otherWork = observation.tasks.some(
    (t) => t.kind !== 'verify' && t.kind !== 'deliver' && t.status !== 'done',
  );
  if (verification.length && !otherWork)
    return advise(
      'verify',
      'verification:' + hash(verification.sort()),
      'Implementation work is marked done, but the task board still has pending or stale verification. Check the current artifact and acceptance criteria before claiming delivery; do not merely repeat author assertions.',
    );
  return decision('none', advanced ? 'Task board advanced.' : 'No intervention justified.');
}
