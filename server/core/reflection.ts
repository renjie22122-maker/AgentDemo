import type { BoardTask } from '../services/task-board.js';
/** A critique of recorded coverage, never a calibrated probability of correctness. */
export function reflectTasks(
  tasks: BoardTask[],
  unknownEffects: number,
  evidenceExists: (id: number) => boolean,
) {
  const observations = tasks.map((task) => {
    const evidence = task.evidence || [];
    const supported = evidence.length > 0 && evidence.every(evidenceExists);
    const currentCheck =
      task.verification?.status === 'checked' && evidenceExists(task.verification.eventId);
    const independent =
      currentCheck &&
      task.verification?.independent === true &&
      !!task.owner &&
      task.verification.checkedBy !== task.owner;
    const issues: string[] = [];
    if (task.status === 'done' && !supported) issues.push('completion-without-valid-evidence');
    if (task.verification?.status === 'stale') issues.push('artifact-changed-since-check');
    if (task.status === 'blocked') issues.push('declared-blocker');
    if (task.status === 'done' && !currentCheck) issues.push('acceptance-check-not-recorded');
    return {
      id: task.id,
      status: task.status,
      supported,
      currentCheck,
      independent,
      issues,
      nextCheck:
        task.status === 'done' && !currentCheck
          ? 'Test a counterexample against acceptance: ' + task.acceptance.slice(0, 400)
          : task.status === 'blocked'
            ? 'Identify the missing prerequisite before retrying.'
            : undefined,
    };
  });
  const unresolved = observations.filter((t) => t.issues.length);
  return {
    version: 1,
    basis: 'declared-task-board-and-recorded-evidence',
    correctnessProbability: null,
    uncertaintyDomains: {
      facts: { status: 'unassessed', basis: 'Tool receipts do not establish all factual claims.' },
      plan: {
        status: tasks.length ? 'declared' : 'unassessed',
        basis: 'Coverage includes declared tasks only; omitted requirements are unknown.',
      },
      tools: {
        status: unknownEffects ? 'outcome-unknown' : 'no-recorded-unknown-effects',
        basis: 'Absence of an unknown effect is not a reliability probability.',
      },
      evidence: {
        status: observations.some((t) => t.issues.length) ? 'gaps' : 'recorded',
        basis: 'Scoped receipts and versioned checks; semantic correctness is not proven.',
      },
      memory: {
        status: 'conditional-context',
        basis: 'Recall conditions and conflicts must be checked against this task.',
      },
      answer: { status: 'unassessed', basis: 'Final answer truth is not independently scored.' },
    },
    regressionRisk: observations.some((t) => t.issues.includes('artifact-changed-since-check'))
      ? 'stale-checks'
      : observations.some((t) => t.status === 'done' && !t.currentCheck)
        ? 'unverified-completion'
        : 'not-estimated',

    coverage: {
      declared: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      evidenceSupported: observations.filter((t) => t.supported).length,
      recordedChecks: observations.filter((t) => t.currentCheck).length,
      independentChecks: observations.filter((t) => t.independent).length,
    },
    unknownEffects,
    semanticCorrectness: 'not-proven',
    nextAction: unknownEffects
      ? 'inspect-effects'
      : unresolved.length
        ? 'investigate-or-verify'
        : tasks.some((t) => t.status !== 'done')
          ? 'continue-plan'
          : 'synthesize-with-limitations',
    uncertainty: unresolved.slice(0, 12),
    omittedUncertainty: Math.max(0, unresolved.length - 12),
    critique:
      'Coverage measures declared tasks only. Missing requirements and semantic contradictions may remain. Challenge assumptions with unseen inputs when warranted; do not use majority vote or self-confidence as verification.',
  };
}
