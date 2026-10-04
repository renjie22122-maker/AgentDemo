import type { BoardTask } from './task-board.js';
/** A bounded read projection of the existing board, never a second authoritative store. */
export function selectTaskContext(tasks: BoardTask[], owner: string, limit = 24) {
  const own = new Set(
    tasks.filter((t) => t.owner === owner && t.status !== 'done').map((t) => t.id),
  );
  const dependencies = new Set<string>(),
    byId = new Map(tasks.map((t) => [t.id, t]));
  function visit(id: string) {
    for (const dep of byId.get(id)?.dependsOn || [])
      if (!dependencies.has(dep)) {
        dependencies.add(dep);
        visit(dep);
      }
  }
  for (const id of own) visit(id);
  const rank = (t: BoardTask) =>
    own.has(t.id)
      ? 0
      : dependencies.has(t.id)
        ? 1
        : t.status === 'blocked' || t.verification?.status === 'stale'
          ? 2
          : t.status === 'running'
            ? 3
            : t.status === 'pending'
              ? 4
              : 5;
  const ordered = [...tasks].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const selected = ordered.slice(0, Math.max(0, limit));
  return {
    selected,
    omitted: tasks.length - selected.length,
    selection: 'owned-dependencies-blockers-active' as const,
  };
}
