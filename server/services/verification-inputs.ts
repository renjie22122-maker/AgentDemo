import { createHash } from 'node:crypto';
import { open, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FileScope } from './paths.js';
import type { BoardTask } from './task-board.js';
export const verificationPaths = (task: Pick<BoardTask, 'artifacts' | 'readPaths'>) => [
  ...new Set([...(task.artifacts || []), ...(task.readPaths || [])]),
];
export async function dependencyStamp(files: FileScope, paths: string[]) {
  const result = {
    scope: JSON.stringify(files.roots),
    files: {} as Record<string, string>,
    complete: true,
    directories: [] as string[],
    manifests: [] as string[],
    coverage: 'declared inputs, local JS/TS imports and root dependency manifests',
  };
  const pending = [...paths],
    seen = new Set<string>();
  let total = 0;
  const alias = (resolved: string) => {
    const index = files.roots.findIndex((root) => {
      const p = path.relative(root, resolved);
      return p === '' || (!p.startsWith('..') && !path.isAbsolute(p));
    });
    if (index < 0) throw Error('Dependency outside scope');
    return (
      '@' + index + '/' + path.relative(files.roots[index], resolved).split(path.sep).join('/')
    );
  };
  const optional = async (name: string) => {
    try {
      const f = await files.resolve(name);
      await lstat(f);
      return f;
    } catch (e: any) {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    }
  };
  // Manifests affect resolution even if no source import names them.
  for (let i = 0; i < files.roots.length; i++)
    for (const name of [
      'package.json',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'tsconfig.json',
      'pyproject.toml',
      'requirements.txt',
      'Cargo.toml',
      'Cargo.lock',
      'go.mod',
      'go.sum',
    ]) {
      try {
        if (await optional('@' + i + '/' + name)) {
          pending.push('@' + i + '/' + name);
          result.manifests.push('@' + i + '/' + name);
        }
      } catch {
        result.complete = false;
      }
    }
  while (pending.length) {
    const name = pending.shift()!;
    try {
      const resolved = await files.resolve(name);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      if (seen.size > 512) throw Error('Verification dependency limit');
      const info = await lstat(resolved);
      if (info.isDirectory()) {
        result.directories.push(alias(resolved).replace(/\/$/, '') + '/');
        for (const entry of await readdir(resolved, { withFileTypes: true })) {
          if (['.git', '.agentdemo', 'node_modules', '.venv', 'dist', 'build'].includes(entry.name))
            continue;
          if (entry.isSymbolicLink()) throw Error('Linked verification input');
          pending.push(alias(path.join(resolved, entry.name)));
        }
        continue;
      }
      if (!info.isFile() || info.size > 4000000 || (total += info.size) > 16000000)
        throw Error('Verification byte limit');
      const handle = await open(resolved, 'r');
      let bytes: Buffer;
      try {
        const before = await handle.stat();
        bytes = await handle.readFile();
        const after = await handle.stat();
        const current = await lstat(await files.resolve(name));
        if (
          before.ino !== after.ino ||
          before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs ||
          current.ino !== after.ino ||
          current.mtimeMs !== after.mtimeMs ||
          current.size !== after.size
        )
          throw Error('Input changed while hashing');
      } finally {
        await handle.close();
      }
      // Preserve explicit keys for existing evidence readers; dependencies use canonical aliases.
      result.files[name] = createHash('sha256').update(bytes!).digest('hex');
      result.files[alias(resolved)] = result.files[name];
      if (/\.[cm]?[jt]sx?$/.test(resolved)) {
        const text = bytes!.toString('utf8');
        for (const match of text.matchAll(
          /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"](\.[^'"\r\n]+)['"]/g,
        )) {
          const base = path.resolve(path.dirname(resolved), match[1]);
          const candidates = [
            base,
            ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'].map((ext) => base + ext),
            ...['index.ts', 'index.tsx', 'index.js'].map((n) => path.join(base, n)),
            ...(/\.js$/.test(base) ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx'] : []),
          ];
          let found = false;
          for (const candidate of candidates) {
            const relative = alias(candidate);
            const file = await optional(relative);
            if (file && (await lstat(file)).isFile()) {
              pending.push(relative);
              found = true;
              break;
            }
          }
          if (!found) result.complete = false;
        }
      }
    } catch {
      result.complete = false;
    }
    if (seen.size > 512) break;
  }
  result.files = Object.fromEntries(
    Object.entries(result.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  return result;
}
