import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { parse } from 'yaml';
import type { Skill } from '../../shared/types.js';
import { assert } from '../core/errors.js';
import { Store, id } from '../storage/store.js';
export function parseSkill(text: string) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  assert(m, 'SKILL_FORMAT', 'SKILL.md requires YAML frontmatter.');
  const meta = parse(m[1]);
  assert(
    typeof meta.name === 'string' &&
      typeof meta.description === 'string' &&
      meta.description.trim(),
    'SKILL_FORMAT',
    'A skill needs a name and a readable description.',
  );
  return { name: meta.name, description: meta.description, content: m[2] };
}
export class Skills {
  constructor(private store: Store) {}
  async import(directory: string) {
    const root = resolve(directory);
    assert((await lstat(root)).isDirectory(), 'SKILL_DIRECTORY', 'Choose a skill directory.');
    const candidates: string[] = [];
    async function walk(path: string, depth: number) {
      if (depth > 8) return;
      for (const e of await readdir(path, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        if (e.isFile() && e.name === 'SKILL.md') candidates.push(join(path, e.name));
        else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          await walk(join(path, e.name), depth + 1);
      }
    }
    await walk(root, 0);
    const added: Skill[] = [];
    for (const path of candidates) {
      const parsed = parseSkill(await readFile(path, 'utf8'));
      const existing = this.store.list<Skill>('skill').find((s) => s.source === path);
      const value = {
        id: existing?.id || id(),
        ...parsed,
        sourceGroup: /anthropic/i.test(path)
          ? 'Anthropic'
          : /openai/i.test(path)
            ? 'OpenAI'
            : basename(root),
        source: path,
        enabled: true,
        createdAt: existing?.createdAt || Date.now(),
      };
      this.store.put('skill', value);
      added.push(value);
    }
    return added;
  }
}
