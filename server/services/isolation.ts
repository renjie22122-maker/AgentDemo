import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, lstat, copyFile, unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { FileScope } from './paths.js';
import { Store, id } from '../storage/store.js';
import { assert } from '../core/errors.js';
export interface Isolation {
  id: string;
  parentRunId: string;
  roots: string[];
  originals: string[];
  base: Record<string, string>;
  state: 'ready' | 'merging' | 'merged' | 'uncertain';
  mergePlan?: { path: string; before: string | null; after: string | null }[];
  applied?: string[];
}
const excluded = (name: string) =>
  name.startsWith('.') || ['node_modules', '__pycache__', 'dist', 'build'].includes(name);
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function scan(scope: FileScope) {
  const files = new Map<string, Buffer>();
  let bytes = 0;
  async function walk(root: number, dir: string) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (excluded(item.name)) continue;
      const path = join(dir, item.name),
        key = '@' + root + '/' + relative(scope.roots[root], path).replaceAll('\\', '/');
      await scope.resolve(key);
      const stat = await lstat(path);
      if (stat.isDirectory()) await walk(root, path);
      else if (stat.isFile()) {
        bytes += stat.size;
        assert(
          files.size < 10000 && bytes <= 64 * 1024 * 1024,
          'ISOLATION_SIZE',
          'Isolated copies support 10,000 files / 64 MB. Narrow the project before delegation.',
        );
        files.set(key, await readFile(path));
      }
    }
  }
  for (let i = 0; i < scope.roots.length; i++) await walk(i, scope.roots[i]);
  return files;
}
export class Isolations {
  private static merging = false;
  constructor(
    private store: Store,
    private directory: string,
  ) {}
  async create(parentRunId: string, source: FileScope): Promise<Isolation> {
    const key = id(),
      roots = source.roots.map((_, i) => join(this.directory, 'isolated', key, String(i)));
    const sourceFiles = await scan(source),
      base: Record<string, string> = {};
    for (const root of roots) await mkdir(root, { recursive: true });
    const target = new FileScope(roots);
    for (const [name, bytes] of sourceFiles) {
      base[name] = hash(bytes);
      const path = await target.resolve(name, true);
      await mkdir(join(path, '..'), { recursive: true });
      await copyFile(await source.resolve(name), path);
      assert(
        hash(await readFile(path)) === base[name],
        'SNAPSHOT_CHANGED',
        'Source changed while copying; retry with a stable source.',
      );
    }
    return this.store.put('isolation', {
      id: key,
      parentRunId,
      roots,
      originals: source.roots,
      base,
      state: 'ready',
    } as Isolation);
  }
  get(key: string) {
    return this.store.get<Isolation>('isolation', key);
  }
  async inspect(key: string) {
    const record = this.get(key),
      files = await scan(new FileScope(record.roots));
    const originals = new FileScope(record.originals);
    const changes = [];
    for (const name of new Set([...Object.keys(record.base), ...files.keys()])) {
      const bytes = files.get(name),
        after = bytes ? hash(bytes) : null,
        before = record.base[name] || null;
      if (after === before) continue;
      let current: Buffer | undefined;
      try {
        current = await readFile(await originals.resolve(name));
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      const currentHash = current ? hash(current) : null;
      const expected = record.mergePlan?.find(
        (c) => c.path === name && c.before === before && c.after === after,
      );
      const alreadyApplied = !!expected && currentHash === after;
      const conflict = currentHash !== before && !alreadyApplied;
      let binary = !!(bytes?.includes(0) || current?.includes(0));
      try {
        for (const b of [bytes, current])
          if (b) new TextDecoder('utf-8', { fatal: true }).decode(b);
      } catch {
        binary = true;
      }
      changes.push({
        path: name,
        before,
        after,
        conflict,
        alreadyApplied,
        binary,
        diff: binary
          ? 'Binary file'
          : createTwoFilesPatch(
              name,
              name,
              current?.toString('utf8') || '',
              bytes?.toString('utf8') || '',
            ).slice(0, 16000),
      });
    }
    const version = hash(
      Buffer.from(
        JSON.stringify(
          changes.map(({ path, before, after, conflict, alreadyApplied }) => ({
            path,
            before,
            after,
            conflict,
            alreadyApplied,
          })),
        ),
      ),
    );
    return {
      state: record.state,
      version,
      changes,
      excluded: 'Hidden files, dependency and build directories are not copied or merged.',
    };
  }
  async merge(key: string, expectedVersion: string) {
    assert(!Isolations.merging, 'MERGE_BUSY', 'Another merge is running; retry after it finishes.');
    Isolations.merging = true;
    try {
      const record = this.get(key);
      assert(
        record.state !== 'merged',
        'MERGE_STATE',
        'Already merged or interrupted merge. Inspect existing files; never replay automatically.',
      );
      const review = await this.inspect(key);
      assert(
        review.version === expectedVersion,
        'MERGE_CHANGED',
        'Changes differ from the approved review. Review again.',
      );
      assert(
        !review.changes.some((c) => c.conflict),
        'MERGE_CONFLICT',
        'Parent files changed after delegation; reconcile explicitly.',
      );
      assert(
        !review.changes.some((c) => c.binary),
        'BINARY_MERGE',
        'Binary changes require manual integration. No files changed.',
      );
      const target = new FileScope(record.originals),
        source = new FileScope(record.roots);
      // Persist uncertainty BEFORE any filesystem mutation. A crash cannot cause automatic replay.
      if (record.mergePlan)
        assert(
          record.mergePlan.every((p) =>
            review.changes.some(
              (c) => c.path === p.path && c.before === p.before && c.after === p.after,
            ),
          ),
          'MERGE_CHANGED',
          'Interrupted merge source changed. Preserve both copies and reconcile manually.',
        );
      record.mergePlan = review.changes.map(({ path, before, after }) => ({ path, before, after }));
      record.applied ||= [];
      record.state = 'merging';
      this.store.put('isolation', record);
      try {
        for (const change of review.changes) {
          const path = await target.resolve(change.path, true);
          let current: Buffer | undefined;
          try {
            current = await readFile(path);
          } catch (e: any) {
            if (e.code !== 'ENOENT') throw e;
          }
          if (change.alreadyApplied) {
            assert(
              (current ? hash(current) : null) === change.after,
              'MERGE_CONFLICT',
              'Previously applied file changed during reconciliation. Inspect again.',
            );
            continue;
          }
          assert(
            (current ? hash(current) : null) === change.before,
            'MERGE_CONFLICT',
            'Parent file changed during merge; partial merge requires inspection.',
          );
          if (change.after === null) await unlink(path);
          else {
            const bytes = await readFile(await source.resolve(change.path));
            assert(hash(bytes) === change.after, 'MERGE_CHANGED', 'Child changed during merge.');
            // Binary files intentionally require manual integration.
            assert(!change.binary, 'BINARY_MERGE', 'Binary changes require manual integration.');
            await target.write(change.path, bytes.toString('utf8'));
          }
          record.applied.push(change.path);
          this.store.put('isolation', record);
        }
        record.applied = review.changes.map((c) => c.path);
        record.state = 'merged';
        this.store.put('isolation', record);
      } catch (e) {
        record.state = 'uncertain';
        this.store.put('isolation', record);
        throw e;
      }
      return { merged: review.changes.map((c) => c.path) };
    } finally {
      Isolations.merging = false;
    }
  }
}
