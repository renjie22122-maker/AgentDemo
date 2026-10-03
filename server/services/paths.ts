import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert } from '../core/errors.js';
export const inside = (root: string, file: string) => {
  const r = path.relative(root, file);
  return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r));
};
export async function validateRoots(roots: string[], protectedRoot?: string) {
  assert(
    roots.length > 0 && roots.length <= 12,
    'FOLDERS_REQUIRED',
    'Choose one to twelve project folders.',
  );
  const privateRoot = protectedRoot ? await realpath(protectedRoot) : undefined;
  const result: string[] = [];
  for (const raw of roots) {
    assert(path.isAbsolute(raw), 'ABSOLUTE_PATH', 'Project folders must be absolute paths.');
    const root = await realpath(raw);
    const stat = await lstat(raw);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'INVALID_FOLDER',
      'Use an existing real directory, not a link.',
    );
    assert(
      root !== path.parse(root).root,
      'BROAD_FOLDER',
      'A filesystem root cannot be used as a project.',
    );
    if (privateRoot)
      assert(
        !inside(root, privateRoot) && !inside(privateRoot, root),
        'PRIVATE_STORAGE',
        'Private application storage cannot be a project.',
      );
    assert(
      !result.some((other) => inside(other, root) || inside(root, other)),
      'OVERLAPPING_FOLDERS',
      'Project folders must not overlap.',
    );
    result.push(root);
  }
  return result;
}
export class FileScope {
  constructor(
    readonly roots: string[],
    readonly privateStorage?: string,
  ) {}
  async resolve(name: string, write = false): Promise<string> {
    const match = name.match(/^@(\d+)[/\\](.*)$/);
    const root = this.roots[match ? Number(match[1]) : 0];
    assert(root, 'UNKNOWN_ROOT', 'Unknown folder alias. Use @0/path, @1/path, etc.');
    const absolute = path.resolve(root, match ? match[2] : name);
    assert(inside(root, absolute), 'OUTSIDE_PROJECT', 'The path is outside this project.', 403);
    assert(
      !this.privateStorage || !inside(this.privateStorage, absolute),
      'PRIVATE_STORAGE',
      'Agent private state is not a project file.',
      403,
    );
    const relative = path.relative(root, absolute).split(path.sep);
    assert(
      !relative.some((p) => ['.git', '.agentdemo'].includes(p.toLowerCase())),
      'PROTECTED_PATH',
      'Repository metadata and private runtime state are protected.',
      403,
    );
    let current = root;
    const rootReal = await realpath(root);
    // Windows realpath expands 8.3 names and canonicalizes case. String inequality
    // is not evidence of a link; inspect each existing ancestor instead.
    for (let ancestor = path.resolve(root); ; ancestor = path.dirname(ancestor)) {
      const stat = await lstat(ancestor);
      assert(!stat.isSymbolicLink(), 'LINKED_ROOT', 'Project root changed to a link.', 403);
      if (ancestor === path.dirname(ancestor)) break;
    }
    if (this.privateStorage) {
      const privateReal = await realpath(this.privateStorage);
      assert(
        !inside(privateReal, path.resolve(rootReal, ...relative)),
        'PRIVATE_STORAGE',
        'Agent private state is not a project file.',
        403,
      );
    }
    for (const part of relative.filter(Boolean)) {
      current = path.join(current, part);
      try {
        const stat = await lstat(current);
        assert(
          !stat.isSymbolicLink() && (!stat.isFile() || stat.nlink === 1),
          'LINKED_PATH',
          'Linked or hard-linked entries are not accessible.',
          403,
        );
        const canonical = await realpath(current);
        assert(
          !path
            .relative(rootReal, canonical)
            .split(path.sep)
            .some((p) => ['.git', '.agentdemo'].includes(p.toLowerCase())),
          'PROTECTED_PATH',
          'Canonical path reaches protected metadata.',
          403,
        );
        assert(
          inside(rootReal, canonical),
          'OUTSIDE_PROJECT',
          'Resolved path leaves the project.',
          403,
        );
      } catch (e: any) {
        if (e.code === 'ENOENT' && write) break;
        throw e;
      }
    }
    return absolute;
  }
  async read(name: string, maxBytes = 1_000_000) {
    const p = await this.resolve(name);
    const stat = await lstat(p);
    assert(
      stat.isFile() && stat.size <= maxBytes,
      'FILE_SIZE',
      'Read a regular file under ' + maxBytes + ' bytes.',
    );
    return readFile(p, 'utf8');
  }
  async write(name: string, content: string) {
    const p = await this.resolve(name, true);
    await mkdir(path.dirname(p), { recursive: true });
    await this.resolve(name, true);
    const tmp = path.join(path.dirname(p), '.agentdemo-write-' + randomUUID());
    await writeFile(tmp, content, { flag: 'wx' });
    await this.resolve(name, true);
    await rename(tmp, p);
    return p;
  }
  async list(name = '.') {
    const p = await this.resolve(name);
    return (await readdir(p, { withFileTypes: true }))
      .filter((d) => !d.isSymbolicLink() && !['.git', 'node_modules', '.data'].includes(d.name))
      .map((d) => ({ name: d.name, type: d.isDirectory() ? 'directory' : 'file' }));
  }
}
