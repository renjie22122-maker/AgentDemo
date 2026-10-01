import { assert } from '../core/errors.js';
import { inferDependencies } from './task-routing.js';
export interface GraphTask {
  id: string;
  dependsOn: string[];
  provides?: string[];
  requires?: string[];
  execution?: string;
  writePaths?: string[];
  externalInputs?: { name: string; source: string }[];
}
export function validateTaskGraph<T extends GraphTask>(input: T[], readOnly = false): T[] {
  assert(input.length > 0 && input.length <= 50, 'PLAN_SIZE', 'Use 1 to 50 tasks.');
  const tasks = inferDependencies(input);
  assert(
    !readOnly || tasks.every((t) => t.execution !== 'isolated' && !t.writePaths?.length),
    'PLAN_SCOPE',
    'This session is read-only. Propose inspection tasks, not implementation assignments. Permissions must be changed by the user before scheduling writes.',
  );
  assert(
    tasks.every((t) => !t.writePaths?.length || t.execution === 'isolated'),
    'PLAN_WRITE_MODE',
    'Tasks with writePaths require isolated execution.',
  );
  const byId = new Map(tasks.map((t) => [t.id, t]));
  assert(byId.size === tasks.length, 'PLAN_DUPLICATE', 'Task IDs must be unique.');
  const visited = new Set<string>();
  const visit = (key: string, trail: Set<string>) => {
    assert(byId.has(key), 'PLAN_DEPENDENCY', 'Unknown dependency: ' + key);
    assert(!trail.has(key), 'PLAN_CYCLE', 'Dependencies must form a DAG. Cycle through ' + key);
    if (visited.has(key)) return;
    const next = new Set(trail).add(key);
    for (const dep of byId.get(key)!.dependsOn) visit(dep, next);
    visited.add(key);
  };
  for (const t of tasks) visit(t.id, new Set());
  return tasks;
}
