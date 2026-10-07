import type { Run } from '../../shared/types.js';
import type { Store } from '../storage/store.js';
import type { FileScope } from './paths.js';
import type { CognitiveState } from '../core/cognitive-policy.js';
import type { RecoveryProposal } from '../core/recovery-planner.js';
import { assert, errorMessage } from '../core/errors.js';
import { Verification } from './verification.js';
import { deliveryEvidence } from './delivery-evidence.js';

type Proposal = RecoveryProposal & { id: string; runId: string; proposalId: string; step: number };
const allowed = new Set([
  'inspect-recorded-effects',
  'verify-current-artifact',
  'inspect-alternative-evidence',
]);
/** Bounded diagnostic dispatch; no command strings, arbitrary paths or permission expansion. */
export async function inspectRecovery(
  store: Store,
  run: Run,
  files: FileScope,
  proposalId: string,
  index: number,
) {
  const proposal = store.maybe<Proposal>('recovery-proposal', run.id);
  assert(
    proposal?.runId === run.id && proposal.proposalId === proposalId,
    'RECOVERY_SCOPE',
    'Use the current proposal ID from this run.',
  );
  const key = run.id + ':' + proposalId + ':' + index;
  const existing = store.maybe<any>('recovery-inspection', key);
  if (existing) return { ...existing, reused: true };
  const state = store.maybe<CognitiveState>('cognitive-state', run.id);
  assert(
    state?.pendingAdvice?.step === proposal.step &&
      state.step >= proposal.step &&
      state.step - proposal.step <= 4,
    'RECOVERY_STALE',
    'Proposal expired or was superseded; inspect current context.',
  );
  const step = proposal.steps[index];
  assert(
    step && allowed.has(step.kind) && !step.requiresApproval,
    'RECOVERY_GATED',
    'This step requires normal task tools or a user scope decision; diagnostic recovery cannot execute it.',
  );
  const record = {
    id: key,
    runId: run.id,
    proposalId,
    index,
    kind: step.kind,
    status: 'inspecting',
    resolved: false,
    causalClaim: false,
  };
  const claimed = store.transaction(() => {
    const duplicate = store.maybe<any>('recovery-inspection', key);
    if (duplicate) return duplicate;
    store.put('recovery-inspection', record);
    store.event(run.conversationId, run.id, 'recovery.inspection_started', record);
    return undefined;
  });
  if (claimed) return { ...claimed, reused: true };
  try {
    if (step.kind === 'verify-current-artifact') await new Verification(store).refresh(run, files);
    const evidence = deliveryEvidence(store, run);
    const result = {
      ...record,
      status: 'inspected',
      evidence,
      next: 'Use current evidence to choose a normal guarded tool. Inspection is not a passing test or permission to replay. Unknown effects remain unresolved.',
    };
    store.transaction(() => {
      store.put('recovery-inspection', result);
      store.event(run.conversationId, run.id, 'recovery.inspected', result);
    });
    return result;
  } catch (error) {
    const result = { ...record, status: 'inspection-failed', error: errorMessage(error) };
    store.put('recovery-inspection', result);
    store.event(run.conversationId, run.id, 'recovery.inspection_failed', result);
    return result;
  }
}
