import type { ToolOutcome } from '../../shared/types.js';
import type { Intervention, CognitiveState } from './cognitive-policy.js';
export interface RecoveryProposal {
  version: 1;
  autoExecute: false;
  steps: { kind: string; reason: string; requiresApproval: boolean }[];
  forbidden: string[];
}
export function recoveryProposal(
  action: Intervention,
  outcomes: ToolOutcome[],
  unknownEffects: number,
): RecoveryProposal {
  const steps: RecoveryProposal['steps'] = [];
  if (unknownEffects > 0 || outcomes.some((o) => o.status === 'unknown'))
    steps.push({
      kind: 'inspect-recorded-effects',
      reason: 'Establish the outcome using read-only evidence; do not replay the operation.',
      requiresApproval: false,
    });
  if (outcomes.some((o) => o.status === 'denied'))
    steps.push({
      kind: 'request-scope-decision',
      reason:
        'Retain the denied boundary; ask the user only if the task requires broader authorization.',
      requiresApproval: true,
    });
  if (outcomes.some((o) => o.status === 'not_started'))
    steps.push({
      kind: 'inspect-execution-prerequisites',
      reason: 'Confirm the backend and dependencies before proposing a new attempt.',
      requiresApproval: false,
    });
  if (action === 'verify')
    steps.push({
      kind: 'verify-current-artifact',
      reason:
        'Use the current artifact and acceptance criteria; previous passing output may be stale.',
      requiresApproval: false,
    });
  if (action === 'change-strategy' || action === 'review-plan' || action === 'diagnose-blocker')
    steps.push({
      kind: 'inspect-alternative-evidence',
      reason:
        'Choose a different read-only observation or revise dependencies without dropping requirements.',
      requiresApproval: false,
    });
  if (action === 'stop')
    steps.push({
      kind: 'report-blocker',
      reason: 'Stop the repeated trajectory and retain unresolved work.',
      requiresApproval: false,
    });
  return {
    version: 1,
    autoExecute: false,
    steps: steps.slice(0, 4),
    forbidden: ['replay-unknown-effects', 'expand-permissions', 'mark-unverified-work-complete'],
  };
}
export function assessIntervention(outcome: NonNullable<CognitiveState['lastAdviceOutcome']>) {
  return {
    action: outcome.action,
    afterBatches: outcome.afterBatches,
    observation: outcome.result,
    assessment: ['verification-recorded', 'task-advanced'].includes(outcome.result)
      ? 'observed-progress'
      : outcome.result === 'verification-regressed'
        ? 'coverage-regressed'
        : outcome.result === 'errors-cleared'
          ? 'errors-cleared-not-verified'
          : outcome.result === 'trajectory-changed'
            ? 'strategy-changed-not-verified'
            : 'no-observed-progress',
    causalClaim: false,
  };
}
