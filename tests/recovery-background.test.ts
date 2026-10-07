import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/storage/store.js';
import { FileScope } from '../server/services/paths.js';
import { prepareRecovery, executeRecovery } from '../server/services/recovery-execution.js';
import { finalizeRun } from '../server/core/finalization.js';
test('recovery action and check yield once and preserve long timeout', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-background-')),
    store = new Store(join(dir, 'db.sqlite'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, 'file'), 'before');
  const run: any = { id: 'r', conversationId: 'c', status: 'running', parentRunId: null };
  const conversation: any = { id: 'c', permission: 'trusted' };
  store.put('run', run);
  store.put('conversation', conversation);
  const jobs = new Map<string, any>();
  let calls = 0;
  const c: any = {
    store,
    run,
    conversation,
    files: new FileScope([dir]),
    signal: new AbortController().signal,
    background: { get: (_c: string, id: string) => jobs.get(id) },
    invokeTool: async (_name: string, args: any) => {
      calls++;
      assert.equal(args.timeoutSeconds, 1500);
      assert.equal(args.yieldAfterSeconds, 10);
      const job = { id: 'job' + calls, runId: 'r', status: 'running' };
      jobs.set(job.id, job);
      return {
        content: JSON.stringify(job),
        eventId: calls,
        outcome: { status: 'succeeded', code: 'COMMAND_SCHEDULED' },
      };
    },
  };
  const contract = await prepareRecovery(c, {
    reason: 'repair',
    expected: 'check passes',
    paths: ['file'],
    action: {
      name: 'run_command',
      arguments: { command: 'action', reason: 'repair', timeoutSeconds: 1500 },
    },
    check: {
      name: 'run_command',
      arguments: { command: 'check', reason: 'verify', timeoutSeconds: 1500 },
    },
  });
  let receipt = await executeRecovery(c, contract.id);
  assert.equal(receipt.status, 'waiting-action');
  assert.equal(calls, 1);
  await assert.rejects(finalizeRun(store, run, c.files), /Recovery is pending/);
  receipt = await executeRecovery(c, contract.id);
  assert.equal(calls, 1);
  assert.equal(receipt.reused, true);
  jobs.get('job1').status = 'completed';
  jobs.get('job1').result = { code: 0, stdout: 'done', stderr: '', timedOut: false };
  receipt = await executeRecovery(c, contract.id);
  assert.equal(receipt.status, 'waiting-check');
  assert.equal(calls, 2);
  await executeRecovery(c, contract.id);
  assert.equal(calls, 2);
  jobs.get('job2').status = 'completed';
  jobs.get('job2').result = { code: 0, stdout: 'passed', stderr: '', timedOut: false };
  receipt = await executeRecovery(c, contract.id);
  assert.equal(receipt.status, 'productive');
  assert.equal(calls, 2);
  await executeRecovery(c, contract.id);
  assert.equal(calls, 2);
});
test('unknown background action blocks delivery and never launches its check', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-unknown-')),
    store = new Store(join(dir, 'db.sqlite'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, 'file'), 'before');
  const run: any = { id: 'r', conversationId: 'c' },
    conversation: any = { id: 'c' };
  store.put('run', run);
  store.put('conversation', conversation);
  const job = { id: 'job', runId: 'r', status: 'running' };
  let calls = 0;
  const c: any = {
    store,
    run,
    conversation,
    files: new FileScope([dir]),
    signal: new AbortController().signal,
    background: { get: () => job },
    invokeTool: async () => {
      calls++;
      return { content: JSON.stringify(job), eventId: 1, outcome: { status: 'succeeded' } };
    },
  };
  const r = await prepareRecovery(c, {
    reason: 'repair',
    expected: 'file changes',
    paths: ['file'],
    action: { name: 'run_command', arguments: { command: 'x', reason: 'x', timeoutSeconds: 900 } },
    check: { name: 'read_file', arguments: { path: 'file' }, contains: 'after' },
  });
  await executeRecovery(c, r.id);
  job.status = 'unknown';
  const result = await executeRecovery(c, r.id);
  assert.equal(result.status, 'unknown');
  assert.equal(calls, 1);
  await assert.rejects(finalizeRun(store, run, c.files), /Recovery is pending/);
  await executeRecovery(c, r.id);
  assert.equal(calls, 1);
});
