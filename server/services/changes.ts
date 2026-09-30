import { FileScope } from './paths.js';
import { lstat } from 'node:fs/promises';
export type Snapshot = {
  files: Map<string, string>;
  partial: boolean;
  incomplete: boolean;
  omitted: Set<string>;
};
const excluded =
  /(^|[/\\])(?:\.[^/\\]*|node_modules|dist|build|vendor|__pycache__)([/\\]|$)|\.(?:pem|key|p12|pfx)$/i;
/** Bounded text observations, not a filesystem transaction or an undo mechanism. */
export async function snapshot(scope: FileScope, only?: string): Promise<Snapshot> {
  const result: Snapshot = {
    files: new Map(),
    partial: false,
    incomplete: false,
    omitted: new Set(),
  };
  let bytes = 0,
    visited = 0;
  async function file(name: string) {
    if (excluded.test(name)) {
      result.partial = true;
      return;
    }
    try {
      const content = await scope.read(name, 256000);
      if (content.includes('\0')) {
        result.partial = true;
        result.omitted.add(name);
        return;
      }
      bytes += Buffer.byteLength(content);
      if (bytes > 2000000) {
        result.partial = true;
        result.incomplete = true;
        return;
      }
      result.files.set(name, content);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        result.partial = true;
        result.omitted.add(name);
      }
    }
  }
  async function walk(name: string, depth = 0) {
    if (depth > 8 || visited > 400 || bytes > 2000000) {
      result.partial = true;
      result.incomplete = true;
      return;
    }
    try {
      for (const entry of await scope.list(name)) {
        if (++visited > 400) {
          result.partial = true;
          result.incomplete = true;
          break;
        }
        const next = name.replace(/\/$/, '') + '/' + entry.name;
        if (excluded.test(next)) {
          result.partial = true;
          continue;
        }
        if (entry.type === 'directory') await walk(next, depth + 1);
        else await file(next);
      }
    } catch {
      result.partial = true;
      result.incomplete = true;
    }
  }
  if (only) {
    // Distinguish a genuinely absent file from an inaccessible/oversized one.
    try {
      await lstat(await scope.resolve(only, true));
      await file(only);
    } catch (e: any) {
      if (e.code !== 'ENOENT') result.partial = true;
    }
  } else for (let i = 0; i < scope.roots.length; i++) await walk('@' + i + '/');
  return result;
}
export function changes(before: Snapshot, after: Snapshot) {
  const result: any[] = [];
  for (const path of new Set([...before.files.keys(), ...after.files.keys()])) {
    const a = before.files.get(path),
      b = after.files.get(path);
    if (a === b) continue;
    if (
      before.omitted.has(path) ||
      after.omitted.has(path) ||
      (a === undefined && before.incomplete) ||
      (b === undefined && after.incomplete)
    )
      continue;
    result.push({ path, before: a ?? null, after: b ?? null });
  }
  return result;
}
