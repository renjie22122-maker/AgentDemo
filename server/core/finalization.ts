import type { Run } from '../../shared/types.js';
import type { Store } from '../storage/store.js';
import type { FileScope } from '../services/paths.js';
import { Verification } from '../services/verification.js';
import { Teams } from '../services/team-space.js';
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
  const plan = await new Verification(store).refresh(run, files);
  const unfinished = plan.tasks.filter(
    (t) =>
      (t.status !== 'done' ||
        t.verification?.status === 'stale' ||
        (!!new Teams(store).get(run) &&
          !!t.artifacts?.length &&
          t.verification?.status !== 'checked')) &&
      ((run.id === plan.id && !new Teams(store).get(run)) || t.owner === run.id),
  );
  assert(
    !unfinished.length,
    'PLAN_INCOMPLETE',
    'Declared plan has unfinished tasks: ' +
      unfinished.map((t) => t.id).join(', ') +
      '. Inspect the board and continue or explain blockers.',
  );
  store.transition(run.id, 'completed');
}
