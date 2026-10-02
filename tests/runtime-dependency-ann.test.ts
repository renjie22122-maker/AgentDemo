import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunPump } from '../server/core/run-pump.js';
import { stamp, sameStamp } from '../server/services/verification.js';
import { FileScope } from '../server/services/paths.js';
import { AnnIndex } from '../server/services/ann.js';
test('pump avoids cross-conversation starvation, cancels queued work and drains without dispatching', async () => {
  const started: string[] = [],
    done = new Map<string, () => void>();
  const pump = new RunPump({
    scope: (k) => k[0],
    status: () => 'running',
    limit: () => 1,
    execute: (k, s) =>
      new Promise<void>((resolve) => {
        started.push(k);
        done.set(k, resolve);
        s.addEventListener('abort', () => resolve(), { once: true });
      }),
    finished: () => {},
  });
  pump.enqueue('a1');
  pump.enqueue('a2');
  pump.enqueue('b1');
  pump.pump();
  await Promise.resolve();
  assert.deepEqual(started, ['a1', 'b1']);
  assert.equal(pump.cancel('a2'), false);
  pump.enqueue('a3');
  pump.stopAccepting();
  for (const k of pump.keys()) pump.cancel(k);
  await pump.drained();
  assert.deepEqual(started, ['a1', 'b1']);
  assert.throws(() => pump.enqueue('c1'), /shutting down/);
});
test('dependency snapshots detect imported files and dependency manifest changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verify-inputs-'));
  try {
    await writeFile(join(dir, 'foo.ts'), "import {x} from './bar.js'; export const y=x;");
    await writeFile(join(dir, 'bar.ts'), 'export const x=1;');
    await writeFile(join(dir, 'package.json'), '{}');
    const scope = new FileScope([dir]),
      before = await stamp(scope, ['foo.ts']);
    assert.equal(before.complete, true);
    assert.ok(before.files['@0/bar.ts']);
    await writeFile(join(dir, 'bar.ts'), 'export const x=2;');
    assert.equal(sameStamp(before, await stamp(scope, ['foo.ts'])), false);
    const second = await stamp(scope, ['foo.ts']);
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    assert.equal(sameStamp(second, await stamp(scope, ['foo.ts'])), false);
    await rm(join(dir, 'bar.ts'));
    assert.equal((await stamp(scope, ['foo.ts'])).complete, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('explicit directory inputs detect new files and unresolved out-of-scope imports fail closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verify-directory-'));
  try {
    await writeFile(join(dir, 'a.txt'), 'first');
    const scope = new FileScope([dir]);
    const a = await stamp(scope, ['.']);
    await writeFile(join(dir, 'b.txt'), 'second');
    assert.equal(sameStamp(a, await stamp(scope, ['.'])), false);
    await writeFile(join(dir, 'evil.ts'), "export * from '../secret.js';");
    assert.equal((await stamp(scope, ['evil.ts'])).complete, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('ANN cache survives worker restart, rejects corrupt binary and changes generation when rows change', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ann-persistent-'));
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    values: [Math.sin(i), Math.cos(i), i / 100],
  }));
  let ann = new AnnIndex(dir);
  try {
    let first = await ann.search('same', rows, rows[0].values, 5);
    assert.equal(first.cacheSource, 'built');
    assert.ok(first.calibration.sampleRecall >= 0.95);
    ann.close();
    ann = new AnnIndex(dir);
    let next = await ann.search('same', rows, rows[0].values, 5);
    assert.equal(next.cacheSource, 'disk');
    assert.deepEqual(next.result, first.result);
    ann.close();
    const binary = (await readdir(dir)).find((n) => n.endsWith('.bin'))!;
    await writeFile(join(dir, binary), 'corrupt');
    ann = new AnnIndex(dir);
    next = await ann.search('same', rows, rows[0].values, 5);
    assert.equal(next.cacheSource, 'built');
    const filtered = rows.filter((r) => r.id !== '0');
    next = await ann.search('same', filtered, rows[0].values, 5);
    assert.ok(next.result.every((r: any) => r.id !== '0'));
    assert.ok((await readdir(dir)).some((n) => n.endsWith('.json')));
  } finally {
    ann.close();
    await new Promise((r) => setTimeout(r, 100));
    await rm(dir, { recursive: true, force: true });
  }
});
