import { readdir, stat, readFile } from 'node:fs/promises';
import { matchesGlob } from 'node:path';
import { z } from 'zod';
import type { ToolRegistry, ToolContext } from './registry.js';
export async function searchFiles(
  c: ToolContext,
  a: { folder: number; pattern: string; query?: string; caseSensitive?: boolean; limit: number },
) {
  const pending = [''],
    results: any[] = [];
  let visited = 0,
    skipped = 0,
    bytes = 0;
  let limited = false;
  while (pending.length) {
    c.signal.throwIfAborted();
    const relative = pending.pop()!,
      prefix = '@' + a.folder + '/' + relative;
    let entries;
    try {
      entries = await readdir(await c.files.resolve(prefix), { withFileTypes: true });
    } catch {
      skipped++;
      continue;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 20000) {
        limited = true;
        pending.length = 0;
        break;
      }
      if (
        e.isSymbolicLink() ||
        e.name.startsWith('.') ||
        ['node_modules', 'dist', 'build', '__pycache__'].includes(e.name)
      ) {
        skipped++;
        continue;
      }
      const path = relative ? relative + '/' + e.name : e.name;
      if (e.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!e.isFile() || !matchesGlob(path, a.pattern)) continue;
      const scoped = '@' + a.folder + '/' + path;
      try {
        const resolved = await c.files.resolve(scoped); // FileScope remains authoritative
        if (a.query === undefined) results.push({ path: scoped });
        else {
          const info = await stat(resolved);
          if (info.size > 1_000_000 || bytes + info.size > 20_000_000) {
            skipped++;
            if (bytes + info.size > 20_000_000) limited = true;
            continue;
          }
          bytes += info.size;
          const buffer = await readFile(await c.files.resolve(scoped));
          if (buffer.includes(0)) {
            skipped++;
            continue;
          }
          const query = a.caseSensitive ? a.query : a.query.toLocaleLowerCase();
          for (const [index, line] of buffer.toString('utf8').split(/\r?\n/).entries())
            if ((a.caseSensitive ? line : line.toLocaleLowerCase()).includes(query)) {
              results.push({
                path: scoped,
                line: index + 1,
                text: line.slice(0, 1000),
                truncated: line.length > 1000,
              });
              if (results.length >= a.limit) break;
            }
        }
      } catch {
        skipped++;
      }
      if (results.length >= a.limit) {
        limited = true;
        pending.length = 0;
        break;
      }
    }
  }
  return {
    results,
    visited,
    skipped,
    truncated: limited,
    matchMode: a.query === undefined ? 'glob' : 'literal',
    note: 'Hidden, linked, build, binary and inaccessible entries are excluded; limits: 20k entries, 1MB/file, 20MB content. Narrow the folder/pattern if truncated.',
  };
}
export function installFileSearch(r: ToolRegistry) {
  const base = {
    folder: z.number().int().min(0).max(11).default(0),
    pattern: z.string().min(1).max(300).default('**/*'),
    limit: z.number().int().min(1).max(1000).default(100),
  };
  r.add({
    name: 'glob',
    effect: 'read',
    parallelSafe: true,
    description:
      'Find scoped file paths using glob patterns (*, **, ?). No shell required. Bounded search reports exclusions and truncation.',
    schema: z.object(base),
    run: async (a, c) => ({ content: JSON.stringify(await searchFiles(c, a)) }),
  });
  r.add({
    name: 'grep',
    effect: 'read',
    parallelSafe: true,
    description:
      'Search UTF-8 workspace files for a literal string and return paths, line numbers and bounded matching lines. No shell, regular expression execution, or project-external reads.',
    schema: z.object({
      ...base,
      query: z.string().min(1).max(500),
      caseSensitive: z.boolean().default(false),
    }),
    run: async (a, c) => ({ content: JSON.stringify(await searchFiles(c, a)) }),
  });
}
