import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeBatch } from '../server/core/tool-batch.js';
import { ProgressMonitor } from '../server/core/progress-monitor.js';
import { recallMemories } from '../server/services/memory-retrieval.js';
import { TaskBoard } from '../server/services/task-board.js';
import { Store } from '../server/storage/store.js';
const call = (name: string) => ({ id: name, name, arguments: {} });
test('parallel reads overlap, mutations fence batches and results commit in declared order', async () => {
  let active = 0,
    peak = 0;
  const committed: string[] = [],
    trace: string[] = [];
  await executeBatch(
    ['a', 'b', 'write', 'c', 'd'].map(call),
    (n) => n !== 'write',
    async (c) => {
      if (c.name === 'write') assert.equal(active, 0);
      active++;
      peak = Math.max(peak, active);
      trace.push(c.name + ' start');
      await new Promise((r) => setTimeout(r, c.name === 'a' ? 25 : 3));
      active--;
      trace.push(c.name + ' end');
      return c.name;
    },
    (_c, v) => {
      committed.push(v);
    },
    new AbortController().signal,
    2,
  );
  assert.equal(peak, 2);
  assert.deepEqual(committed, ['a', 'b', 'write', 'c', 'd']);
  assert(trace.indexOf('write start') > trace.indexOf('a end'));
  assert(trace.indexOf('c start') > trace.indexOf('write end'));
});
test('failed parallel operation is fully settled before unwinding and next mutation never starts', async () => {
  let settled = false,
    write = false;
  await assert.rejects(
    executeBatch(
      ['a', 'b', 'write'].map(call),
      (n) => n !== 'write',
      async (c) => {
        if (c.name === 'a') throw Error('bad read');
        if (c.name === 'write') write = true;
        await new Promise((r) => setTimeout(r, 20));
        settled = true;
        return '';
      },
      () => {},
      new AbortController().signal,
    ),
  );
  assert(settled);
  assert.equal(write, false);
});
test('pre-aborted batch starts nothing', async () => {
  const controller = new AbortController();
  controller.abort();
  let count = 0;
  await assert.rejects(
    executeBatch(
      [call('a')],
      () => true,
      async () => {
        count++;
        return '';
      },
      () => {},
      controller.signal,
    ),
  );
  assert.equal(count, 0);
});
test('oscillation detector uses outcomes and resets on new user instructions', () => {
  const monitor = new ProgressMonitor();
  for (let i = 0; i < 7; i++) assert.equal(monitor.observe([i % 2], ['same']), false);
  assert.equal(monitor.observe([1], ['same']), true);
  monitor.reset();
  for (let i = 0; i < 20; i++) assert.equal(monitor.observe(['poll'], ['new result ' + i]), false);
});
test('memory retrieval honors scope, activation and expiry; old relevant facts beat recent noise', () => {
  const base = {
    source: 'user',
    active: true,
    expiresAt: null,
    revision: 1,
    createdAt: 1,
    scope: 'user',
  };
  const rows = Array.from({ length: 40 }, (_, i) => ({
    ...base,
    id: 'noise' + i,
    content: 'unrelated cooking recipe',
    createdAt: 1000 + i,
  }));
  rows.push({ ...base, id: 'old', content: 'Cedar database backup retention 17 days' });
  rows.push({ ...base, id: 'other', content: 'Cedar database secret', scope: 'project:other' });
  rows.push({ ...base, id: 'inactive', content: 'Cedar database unconfirmed', active: false });
  const found = recallMemories(rows, 'Cedar database retention', 'here', 2000);
  assert.deepEqual(
    found.map((x) => x.id),
    ['old'],
  );
  assert.equal(recallMemories(rows, 'unmatchedword', 'here').length, 0);
  assert.equal(
    recallMemories([{ ...base, id: 'zh', content: '数据库备份保留十七天' }], '数据库备份', null)
      .length,
    1,
  );
  assert.equal(
    recallMemories([{ ...base, id: 'expired', content: 'Cedar', expiresAt: 2 }], 'Cedar', null, 3)
      .length,
    0,
  );
});
function fixture() {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'board-')), 'db.sqlite'));
  const root = { id: 'root', conversationId: 'a', parentRunId: null } as any;
  const child = { id: 'child', conversationId: 'b', parentRunId: 'root' } as any;
  const sibling = { id: 'sibling', conversationId: 'c', parentRunId: 'root' } as any;
  const outsider = { id: 'outside', conversationId: 'd', parentRunId: null } as any;
  for (const r of [root, child, sibling, outsider]) {
    store.put('run', r);
    store.put('conversation', { id: r.conversationId, permission: 'ask' });
  }
  return { store, board: new TaskBoard(store), root, child, sibling, outsider };
}
test('task DAG rejects cycles, stale writes, blocked dependencies and foreign owners', () => {
  const f = fixture();
  try {
    assert.throws(
      () =>
        f.board.create(f.root, [{ id: 'a', title: 'A', acceptance: 'read', dependsOn: ['a'] }], 0),
      /DAG/,
    );
    f.board.create(
      f.root,
      [
        { id: 'a', title: 'A', acceptance: 'read', dependsOn: [] },
        { id: 'b', title: 'B', acceptance: 'read', dependsOn: ['a'] },
      ],
      0,
    );
    assert.throws(() => f.board.update(f.child, 'b', 1, 'running', [], ''), /dependencies/);
    f.board.update(f.child, 'a', 1, 'running', [], '');
    assert.throws(() => f.board.update(f.sibling, 'a', 2, 'running', [], ''), /owns/);
    assert.throws(() => f.board.update(f.root, 'a', 1, 'running', [], ''), /revision/);
    assert.throws(() => f.board.update(f.child, 'a', 2, 'done', [], ''), /event IDs/);
    const e = f.store.event('d', 'outside', 'tool.completed', {
      name: 'read_file',
      output: 'value',
    });
    assert.throws(() => f.board.update(f.child, 'a', 2, 'done', [e.id], ''), /another/);
    const fail = f.store.event('b', 'child', 'tool.completed', {
      name: 'read_file',
      output: 'Tool error: denied',
    });
    assert.throws(() => f.board.update(f.child, 'a', 2, 'done', [fail.id], ''), /failed tool/);
    const pass = f.store.event('b', 'child', 'tool.completed', {
      name: 'read_file',
      output: 'value',
    });
    f.board.update(f.child, 'a', 2, 'done', [pass.id], 'observed');
    f.board.update(f.sibling, 'b', 3, 'running', [], '');
    assert.throws(() => f.board.update(f.root, 'a', 4, 'pending', [], ''), /downstream/);
    assert.equal(f.board.get(f.root).revision, 4);
  } finally {
    f.store.close();
  }
});

test('semantic memory index excludes candidates and invalidates revisions, scopes and deletion', async () => {
  const f = fixture();
  const { MemoryIndex } = await import('../server/services/memory-index.js');
  const encoded: string[][] = [];
  const embeddings = {
    enabled: () => true,
    fingerprint: () => 'fixture-v1',
    encode: async (texts: string[]) => {
      encoded.push(texts);
      return texts.map(() => [1, 0]);
    },
  } as any;
  const memory = {
    id: 'm',
    scope: 'project:p',
    content: 'Use seventeen days for archives',
    source: 'user',
    revision: 1,
    active: true,
    expiresAt: null,
    createdAt: 1,
  };
  f.store.put('memory', memory);
  f.store.put('memory', { ...memory, id: 'candidate', active: false, content: 'secret candidate' });
  const index = new MemoryIndex(f.store, embeddings);
  try {
    assert.equal((await index.index()).indexed, 1);
    assert(!encoded.flat().includes('secret candidate'));
    const signal = new AbortController().signal;
    assert.equal((await index.recall('retention', 'p', signal)).memories[0]?.id, 'm');
    assert.equal((await index.recall('retention', 'other', signal)).memories.length, 0);
    f.store.put('memory', { ...memory, revision: 2, content: 'unrelated changed fact' });
    assert.equal((await index.recall('retention', 'p', signal)).memories.length, 0);
    await index.index();
    f.store.remove('memory', 'm');
    assert.equal((await index.recall('retention', 'p', signal)).memories.length, 0);
  } finally {
    f.store.close();
  }
});

test('version-bound check becomes stale after edits and cannot use unrelated read evidence', async () => {
  const f = fixture();
  const { FileScope } = await import('../server/services/paths.js');
  const { Verification, stamp } = await import('../server/services/verification.js');
  const { writeFile } = await import('node:fs/promises');
  const folder = mkdtempSync(join(tmpdir(), 'verify-artifact-')),
    files = new FileScope([folder]);
  try {
    await writeFile(join(folder, 'answer.txt'), '31');
    f.board.create(
      f.root,
      [
        {
          id: 'a',
          title: 'A',
          acceptance: 'answer is 31',
          dependsOn: [],
          artifacts: ['answer.txt'],
        },
      ],
      0,
    );
    const snapshot = await stamp(files, ['answer.txt']);
    const event = f.store.event('a', 'root', 'tool.completed', {
      name: 'read_file',
      output: '31',
      verification: {
        before: snapshot,
        after: snapshot,
        passed: true,
        checkedPaths: ['answer.txt'],
      },
    });
    f.board.update(f.root, 'a', 1, 'done', [event.id], 'read');
    const verify = new Verification(f.store);
    await verify.record(f.root, files, 'a', 2, event.id);
    assert.equal(f.board.get(f.root).tasks[0].verification?.status, 'checked');
    await writeFile(join(folder, 'answer.txt'), '32');
    assert.equal((await verify.refresh(f.root, files)).tasks[0].verification?.status, 'stale');
    await assert.rejects(verify.record(f.root, files, 'a', 4, event.id), /changed/);
    const current = await stamp(files, ['answer.txt']);
    const unrelated = f.store.event('a', 'root', 'tool.completed', {
      name: 'read_file',
      output: 'elsewhere',
      verification: { before: current, after: current, passed: true, checkedPaths: ['other.txt'] },
    });
    f.board.update(f.root, 'a', 4, 'done', [unrelated.id], '');
    await assert.rejects(verify.record(f.root, files, 'a', 5, unrelated.id), /changed/);
  } finally {
    f.store.close();
  }
});
test('team handoff blocks active owners, foreign workers and unknown effects', () => {
  const f = fixture();
  try {
    f.store.put('run', { ...f.child, status: 'running' });
    f.store.put('run', { ...f.sibling, status: 'running' });
    f.board.create(f.root, [{ id: 'a', title: 'A', acceptance: 'read', dependsOn: [] }], 0);
    f.board.update(f.child, 'a', 1, 'running', [], '');
    assert.throws(() => f.board.handoff(f.root, 'a', 2, 'sibling', 'continue'), /current owner/);
    f.store.put('run', { ...f.child, status: 'interrupted' });
    const effect = f.store.beginEffect('child', 'run_command', { command: 'unknown' });
    assert.throws(() => f.board.handoff(f.root, 'a', 2, 'sibling', 'continue'), /uncertain/);
    f.store.endEffect(effect, 'inspected', 'completed');
    assert.throws(() => f.board.handoff(f.root, 'a', 2, 'outside', 'continue'), /active member/);
    const board = f.board.handoff(f.root, 'a', 2, 'sibling', 'continue after inspection');
    assert.equal(board.tasks[0].owner, 'sibling');
    assert.equal(f.store.list('task-handoff').length, 1);
    assert.equal(f.board.members(f.root).find((m) => m.runId === 'sibling')?.tasks[0], 'a');
    assert.throws(() => f.board.handoff(f.child, 'a', 3, 'root', 'steal'), /lead/);
  } finally {
    f.store.close();
  }
});

test('verification rejects removed manifests and missing current artifacts', async () => {
  const f = fixture();
  const { FileScope } = await import('../server/services/paths.js');
  const { Verification, stamp } = await import('../server/services/verification.js');
  const { writeFile, rm } = await import('node:fs/promises');
  const folder = mkdtempSync(join(tmpdir(), 'verify-removal-')),
    files = new FileScope([folder]);
  try {
    await writeFile(join(folder, 'answer.txt'), '31');
    await writeFile(join(folder, 'package.json'), '{}');
    f.board.create(
      f.root,
      [{ id: 'a', title: 'A', acceptance: 'answer', dependsOn: [], artifacts: ['answer.txt'] }],
      0,
    );
    const snapshot = await stamp(files, ['answer.txt']);
    const event = f.store.event('a', 'root', 'tool.completed', {
      name: 'read_file',
      verification: {
        before: snapshot,
        after: snapshot,
        passed: true,
        checkedPaths: ['answer.txt'],
      },
    });
    f.board.update(f.root, 'a', 1, 'done', [event.id], 'read');
    const verify = new Verification(f.store);
    await rm(join(folder, 'package.json'));
    await assert.rejects(verify.record(f.root, files, 'a', 2, event.id), /manifests changed/);
    await writeFile(join(folder, 'package.json'), '{}');
    await rm(join(folder, 'answer.txt'));
    await assert.rejects(verify.record(f.root, files, 'a', 2, event.id), /incomplete/);
  } finally {
    f.store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
