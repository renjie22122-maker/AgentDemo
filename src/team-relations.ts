import type { AgentEvent } from '../shared/types';
import type { RunView, ConversationDetail } from './types';

export function relatedRuns(runs: RunView[], seeds: string[]) {
  const ids = new Set(seeds);
  const children = new Map<string, string[]>();
  for (const r of runs)
    if (r.parentRunId) children.set(r.parentRunId, [...(children.get(r.parentRunId) || []), r.id]);
  const queue = [...ids];
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) || [])
      if (!ids.has(child)) {
        ids.add(child);
        queue.push(child);
      }
  return runs.filter((r) => ids.has(r.id));
}
export function relationTree(runs: RunView[]) {
  const ids = new Set(runs.map((r) => r.id)),
    seen = new Set<string>();
  const children = new Map<string, RunView[]>();
  for (const run of runs)
    if (run.parentRunId && ids.has(run.parentRunId))
      children.set(run.parentRunId, [...(children.get(run.parentRunId) || []), run]);
  const rows: { run: RunView; level: number; missingParent: boolean }[] = [];
  const walk = (root: RunView) => {
    const queue = [{ run: root, level: 0 }];
    while (queue.length) {
      const item = queue.pop()!;
      if (seen.has(item.run.id)) continue;
      seen.add(item.run.id);
      rows.push({
        ...item,
        missingParent: !!item.run.parentRunId && !ids.has(item.run.parentRunId),
      });
      queue.push(
        ...(children.get(item.run.id) || [])
          .slice()
          .reverse()
          .map((run) => ({ run, level: item.level + 1 })),
      );
    }
  };
  runs.filter((r) => !r.parentRunId || !ids.has(r.parentRunId)).forEach(walk);
  runs.filter((r) => !seen.has(r.id)).forEach(walk);
  return rows;
}
export function communicationEdges(
  runs: RunView[],
  events: AgentEvent[],
  messages: NonNullable<ConversationDetail['teamSpace']>['messages'],
) {
  const ids = new Set(runs.map((r) => r.id)),
    seen = new Set<string>();
  const edges = new Map<
    string,
    { from: string; to: string; count: number; kind: 'direct' | 'discussion'; latest: number }
  >();
  const add = (id: string, from: string, to: string, kind: 'direct' | 'discussion', at: number) => {
    if (!ids.has(from) || !ids.has(to) || seen.has(id)) return;
    seen.add(id);
    const key = JSON.stringify([from, to, kind]),
      old = edges.get(key);
    edges.set(key, {
      from,
      to,
      kind,
      count: (old?.count || 0) + 1,
      latest: Math.max(old?.latest || 0, at),
    });
  };
  for (const e of events)
    if (e.type === 'agent.message.submitted')
      add('event:' + e.id, e.data.sender, e.data.recipient, 'direct', e.createdAt);
  for (const m of messages)
    for (const to of m.recipients || [])
      add('discussion:' + m.id + ':' + to, m.sender, to, 'discussion', m.at || 0);
  return [...edges.values()].sort((a, b) => b.latest - a.latest);
}
