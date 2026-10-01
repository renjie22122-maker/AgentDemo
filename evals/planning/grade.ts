import { taskInput } from '../../server/services/task-board.js';
import { validateTaskGraph } from '../../server/services/task-graph.js';
import type { PlanningCase } from './cases.js';
export function reachability(ids: string[], edges: [string, string][]) {
  const result = new Set<string>(),
    next = new Map<string, string[]>();
  for (const [a, b] of edges) next.set(a, [...(next.get(a) || []), b]);
  for (const start of ids) {
    const seen = new Set<string>(),
      queue = [...(next.get(start) || [])];
    while (queue.length) {
      const n = queue.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      result.add(start + '>' + n);
      queue.push(...(next.get(n) || []));
    }
  }
  return result;
}
export function gradePlan(test: PlanningCase, raw: unknown) {
  try {
    const parsed = taskInput.array().parse(raw);
    const tasks = validateTaskGraph(parsed, test.readOnly);
    const actualIds = new Set(tasks.map((t) => t.id));
    const added = tasks.filter((t) => !test.tasks.includes(t.id)).map((t) => t.id),
      missing = test.tasks.filter((id) => !actualIds.has(id));
    const expected = reachability(test.tasks, test.edges);
    const actual = reachability(
      tasks.map((t) => t.id),
      tasks.flatMap((t) => t.dependsOn.map((d) => [d, t.id] as [string, string])),
    );
    const missingDependencies = [...expected].filter((e) => !actual.has(e)),
      unnecessaryDependencies = [...actual].filter((e) => !expected.has(e));
    return {
      pass:
        !added.length &&
        !missing.length &&
        !missingDependencies.length &&
        !unnecessaryDependencies.length,
      added,
      missing,
      missingDependencies,
      unnecessaryDependencies,
    };
  } catch (error) {
    return { pass: false, error: error instanceof Error ? error.message : 'Invalid plan' };
  }
}
