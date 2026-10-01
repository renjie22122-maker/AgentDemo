import { posix } from 'node:path';
import { z } from 'zod';
import { assert } from '../core/errors.js';
import type { BoardTask } from './task-board.js';
export const workerExpertise = z.object({
  description: z.string().max(1000).optional(),
  runId: z.string(),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  paths: z.array(z.string().min(1).max(2048)).max(30).default([]),
});
export type WorkerExpertise = z.infer<typeof workerExpertise>;
export function pathOverlap(a: string, b: string) {
  const norm = (p: string) =>
    posix
      .normalize(p.replaceAll('\\', '/').replace(/^@0\//, '').split('*')[0])
      .replace(/\/+$/, '')
      .toLowerCase();
  a = norm(a);
  b = norm(b);
  return (
    !a || !b || a === '.' || b === '.' || a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
  );
}
export function resourceConflict(a: BoardTask, b: BoardTask) {
  const aw =
    a.execution === 'isolated'
      ? a.writePaths?.length
        ? a.writePaths
        : a.artifacts?.length
          ? a.artifacts
          : ['.']
      : [];
  const bw =
    b.execution === 'isolated'
      ? b.writePaths?.length
        ? b.writePaths
        : b.artifacts?.length
          ? b.artifacts
          : ['.']
      : [];
  const ar = a.readPaths?.length ? a.readPaths : [],
    br = b.readPaths?.length ? b.readPaths : [];
  return (
    aw.some((x) => [...bw, ...br].some((y) => pathOverlap(x, y))) ||
    bw.some((x) => ar.some((y) => pathOverlap(x, y)))
  );
}
export function inferDependencies<
  T extends {
    id: string;
    dependsOn: string[];
    provides?: string[];
    requires?: string[];
    externalInputs?: { name: string; source: string }[];
  },
>(tasks: T[]): T[] {
  return tasks.map((t) => {
    const inferred = (t.requires || []).flatMap((resource) => {
      const inputs = t.externalInputs || [];
      assert(
        new Set(inputs.map((i) => i.name)).size === inputs.length,
        'PLAN_CONTRACT',
        'External input names must be unique.',
      );
      const supplied = inputs.some((i) => i.name === resource && i.source.trim());
      const providers = tasks.filter((p) => (p.provides || []).includes(resource));
      assert(
        (supplied && providers.length === 0) ||
          (!supplied && providers.length === 1 && providers[0].id !== t.id),
        'PLAN_CONTRACT',
        'Each required contract needs exactly one other producer or a declared existing input with source: ' +
          resource,
      );
      return supplied ? [] : [providers[0].id];
    });
    return { ...t, dependsOn: [...new Set([...t.dependsOn, ...inferred])] };
  });
}
export function routingScore(
  task: BoardTask,
  profile: WorkerExpertise | undefined,
  history: BoardTask[],
  load: number,
) {
  const tags = new Set((profile?.skills || []).map((x) => x.toLowerCase()));
  const skills = (task.skills || []).filter((x) => tags.has(x.toLowerCase())).length;
  const paths = (task.writePaths || task.artifacts || []).filter((p) =>
    (profile?.paths || []).some((x) => pathOverlap(p, x)),
  ).length;
  const taskTags = new Set((task.skills || []).map((s) => s.toLowerCase()));
  const relevant = history.filter((t) =>
    (t.skills || []).some((s) => taskTags.has(s.toLowerCase())),
  );
  const verified = relevant.filter(
    (t) => t.status === 'done' && t.verification?.status === 'checked',
  ).length;
  const blocked = relevant.filter((t) => t.status === 'blocked').length;
  // Claims are hints, never permissions; history counts only host-bound, checked task evidence.
  const words = (text: string) =>
    new Set(
      [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text.toLowerCase())]
        .filter((x) => x.isWordLike)
        .map((x) => x.segment),
    );
  const wanted = words(task.title + ' ' + task.acceptance),
    have = words(profile?.description || '');
  const relevance = wanted.size ? [...wanted].filter((w) => have.has(w)).length / wanted.size : 0;
  const historyScore = Math.min(3, verified) - Math.min(3, blocked);
  const score =
    skills * 4 + Math.min(3, paths) * 2 + historyScore + Math.min(2, relevance * 4) - load * 2;
  return {
    score,
    skills,
    paths,
    verified,
    blocked,
    load,
    relevance,
    relevanceMethod: 'lexical-overlap',
  };
}
