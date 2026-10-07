import { deliveryEvidence } from '../services/delivery-evidence.js';
import type { Run } from '../../shared/types.js';
import type { Store } from '../storage/store.js';
import type { FileScope } from '../services/paths.js';
import { Verification } from '../services/verification.js';
import { assert } from './errors.js';
// Host completion authority. No model calls, scheduling or command execution.
export async function finalizeRun(store: Store, run: Run, files: FileScope) {
  if (run.recoveryOnly && store.unknownEffects(run.conversationId).length) {
    store.transition(
      run.id,
      'interrupted',
      'Read-only inspection finished. Some operation outcomes remain unresolved; no side effects were replayed.',
    );
    return;
  }
  assert(
    !store.unknownEffects(run.conversationId).length,
    'OUTCOME_UNKNOWN',
    'An operation has an unknown outcome. Inspect it before treating the task as complete.',
  );
  await new Verification(store).refresh(run, files);
  const report = deliveryEvidence(store, run);
  store.event(run.conversationId, run.id, 'delivery.assessed', report);
  assert(
    !report.blockers.tasks.length,
    'PLAN_INCOMPLETE',
    'Declared plan has unfinished tasks: ' +
      report.blockers.tasks.join(', ') +
      '. Inspect the board and continue or explain blockers.',
  );
  assert(
    !report.blockers.challenges.length,
    'CHALLENGE_OPEN',
    'Unresolved task challenges: ' +
      report.blockers.challenges.join(', ') +
      '. Inspect counterexamples and resolve with current evidence.',
  );
  assert(
    !report.blockers.memories.length,
    'MEMORY_CHECK_PENDING',
    'Recalled experience checks remain pending: ' +
      report.blockers.memories.join(', ') +
      '. Verify applicability or record a concrete reason with resolve_memory_check.',
  );
  store.transition(run.id, 'completed');
}
