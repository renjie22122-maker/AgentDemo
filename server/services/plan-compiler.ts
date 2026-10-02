import { validateTaskGraph, type GraphTask } from './task-graph.js';
import { resourceConflict } from './task-routing.js';
import { assert } from '../core/errors.js';
export function compilePlan<T extends GraphTask & { kind?: string; acceptance: string }>(
  input: T[],
  readOnly = false,
) {
  const tasks = validateTaskGraph(input, readOnly),
    levels: Record<string, number> = {},
    warnings: string[] = [];
  const level = (id: string): number =>
    levels[id] ??
    (levels[id] = Math.max(
      0,
      ...tasks.find((t) => t.id === id)!.dependsOn.map((d) => level(d) + 1),
    ));
  for (const t of tasks) {
    level(t.id);
    if (t.kind === 'verify')
      assert(
        t.dependsOn.length > 0,
        'PLAN_VERIFY_INPUT',
        'Verification tasks must name the work they verify.',
      );
    if (
      t.execution === 'isolated' &&
      !tasks.some((v) => v.kind === 'verify' && v.dependsOn.includes(t.id))
    )
      warnings.push('No explicit verification successor for ' + t.id);
  }
  for (let i = 0; i < tasks.length; i++)
    for (let j = i + 1; j < tasks.length; j++)
      if (
        levels[tasks[i].id] === levels[tasks[j].id] &&
        resourceConflict(tasks[i] as any, tasks[j] as any)
      )
        warnings.push(
          'Potential same-layer resource contention: ' + tasks[i].id + ' / ' + tasks[j].id,
        );
  return {
    version: 1,
    tasks,
    layers: Array.from({ length: Math.max(...Object.values(levels)) + 1 }, (_, i) =>
      tasks.filter((t) => levels[t.id] === i).map((t) => t.id),
    ),
    warnings,
    meaning: 'Host-validated contracts and dependencies; not proof of semantic completeness.',
  };
}
