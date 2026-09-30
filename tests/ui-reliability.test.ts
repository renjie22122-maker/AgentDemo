import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileScope } from '../server/services/paths.js';
import { snapshot, changes } from '../server/services/changes.js';
import { mathDelimiters } from '../src/markdown-source.js';
import { connectLive } from '../src/live.js';
test('text snapshots distinguish added, edited, deleted, omitted files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'changes-')),
    scope = new FileScope([root]);
  await writeFile(join(root, '.env'), 'PRIVATE');
  await writeFile(join(root, 'a.txt'), 'before\n');
  const a = await snapshot(scope);
  await writeFile(join(root, 'a.txt'), 'after\n');
  await writeFile(join(root, 'b.txt'), 'new');
  const b = await snapshot(scope);
  assert.equal(changes(a, b).length, 2);
  assert(!b.files.has('@0/.env'));
  await unlink(join(root, 'a.txt'));
  assert.equal(changes(b, await snapshot(scope)).find((c) => c.path === '@0/a.txt')?.after, null);
  await writeFile(join(root, 'b.txt'), Buffer.from([0, 1, 2]));
  assert.equal(
    changes(b, await snapshot(scope)).some((c) => c.path === '@0/b.txt'),
    false,
  );
});
test('math delimiter normalization never rewrites code examples', () => {
  assert.equal(mathDelimiters('A \\(x^2\\)'), 'A $x^2$');
  assert.equal(mathDelimiters('```js\nconst x="\\(x\\)"\n```'), '```js\nconst x="\\(x\\)"\n```');
  assert.equal(mathDelimiters('`\\[x\\]`'), '`\\[x\\]`');
});
test('SSE makes exactly five retries, manual retry resets, close cancels', async () => {
  const saved = {
    EventSource: globalThis.EventSource,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const tasks = new Map<number, () => void>();
  let index = 0;
  const sources: any[] = [];
  const statuses: string[] = [];
  class Source {
    onerror = () => {};
    listeners = new Map();
    constructor() {
      sources.push(this);
    }
    close() {}
    addEventListener(name: string, fn: () => void) {
      this.listeners.set(name, fn);
    }
  }
  try {
    globalThis.EventSource = Source as any;
    globalThis.setTimeout = ((fn: any) => {
      tasks.set(++index, fn);
      return index;
    }) as any;
    globalThis.clearTimeout = ((id: any) => tasks.delete(id)) as any;
    globalThis.setInterval = (() => 999) as any;
    globalThis.clearInterval = (() => {}) as any;
    const link = connectLive('/fixture', {}, (s) => statuses.push(s));
    await Promise.resolve();
    await Promise.resolve();
    for (let n = 0; n < 6; n++) {
      sources.at(-1).onerror();
      const task = tasks.values().next().value;
      if (task) {
        tasks.clear();
        task();
        await Promise.resolve();
        await Promise.resolve();
      }
    }
    assert.equal(sources.length, 6);
    assert(statuses.at(-1)?.includes('exhausted'));
    assert.equal(tasks.size, 0);
    link.retry();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sources.length, 7);
    link.close();
    assert.equal(tasks.size, 0);
  } finally {
    Object.assign(globalThis, saved);
  }
});
