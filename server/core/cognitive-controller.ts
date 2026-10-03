import type { Run, ModelMessage } from '../../shared/types.js';
import { TaskBoard } from '../services/task-board.js';
import type { Store } from '../storage/store.js';
import { cognitivePolicy, initialCognitiveState, type CognitiveState } from './cognitive-policy.js';
// Adapter owns observations and audit only. Policy has no executor, approval or filesystem port.
export class CognitiveController {
  constructor(private store: Store) {}
  snapshot(run: Run): ModelMessage | undefined {
    const board = new TaskBoard(this.store).get(run);
    const uncertain = this.store.unknownEffects(run.conversationId);
    if (!board.tasks.length && !uncertain.length) return undefined;
    const tasks = [...board.tasks].sort(
      (a, b) => Number(a.status === 'done') - Number(b.status === 'done'),
    );
    return {
      role: 'user',
      contextKind: 'task-snapshot',
      content:
        '[Host task-state snapshot; status observations, not proof of correctness or permission. Inspect the task board for full acceptance criteria before acting.]\n' +
        JSON.stringify({
          boardId: board.id,
          revision: board.revision,
          totalTasks: tasks.length,
          omittedTasks: Math.max(0, tasks.length - 24),
          unresolvedEffects: uncertain.map((e) => ({ id: e.id, tool: e.tool })).slice(0, 20),
          unresolvedEffectCount: uncertain.length,
          tasks: tasks.slice(0, 24).map((t) => ({
            id: t.id,
            status: t.status,
            kind: t.kind,
            owner: t.owner,
            dependsOn: t.dependsOn,
            verification: t.verification?.status || 'not-recorded',
          })),
        }),
    };
  }
  reset(run: Run) {
    this.store.put('cognitive-state', { id: run.id, ...initialCognitiveState() });
  }
  observe(
    run: Run,
    calls: unknown,
    outputs: string[],
    outcomes?: import('../../shared/types.js').ToolOutcome[],
  ) {
    const saved = this.store.maybe<CognitiveState>('cognitive-state', run.id);
    const decision = cognitivePolicy(saved?.version === 1 ? saved : initialCognitiveState(), {
      calls,
      outputs,
      outcomes,
      tasks: new TaskBoard(this.store).get(run).tasks,
    });
    this.store.transaction(() => {
      this.store.put('cognitive-state', { ...decision.state, id: run.id });
      this.store.event(run.conversationId, run.id, 'cognitive.observed', {
        step: decision.state.step,
        signals: decision.state.signals,
        adviceOutcome: decision.state.lastAdviceOutcome,
        action: decision.action,
        reason: decision.reason,
      });
      if (decision.action !== 'none')
        this.store.event(run.conversationId, run.id, 'cognitive.intervention', {
          action: decision.action,
          reason: decision.reason,
          message: decision.message,
        });
    });
    return decision;
  }
  context(run: Run, budget: { tokens: number; threshold: number; method: string }) {
    this.store.put('cognitive-context', {
      id: run.id,
      tokens: budget.tokens,
      threshold: budget.threshold,
      pressure: budget.threshold > 0 ? budget.tokens / budget.threshold : null,
      method: budget.method,
      policy: 'Existing ContextManager alone performs bounded compaction.',
    });
  }
}
