import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Configuration } from '../server/services/settings.js';
import { FileScope } from '../server/services/paths.js';
import { dockerMetadataMasks } from '../server/services/protected-metadata.js';
import { resultSucceeded, commandOutcome } from '../server/core/tool-outcome.js';
import { termination } from '../server/core/termination.js';
import { AppError } from '../server/core/errors.js';
import { sse } from '../server/providers/protocol.js';

test('fresh configuration isolates commands; explicit host choice survives reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentdemo-policy-'));
  const file = join(root, 'config.json');
  const config = new Configuration(file);
  assert.equal(
    config.get().commandBackend,
    process.platform === 'win32' ? 'native-windows' : 'docker',
  );
  config.save({ ...config.get(), commandBackend: 'approval-host' });
  assert.equal(new Configuration(file).get().commandBackend, 'approval-host');
});
test('metadata paths reject mixed-case reads and writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentdemo-path-'));
  await mkdir(join(root, '.GiT'));
  await writeFile(join(root, '.GiT', 'config'), 'private');
  const files = new FileScope([root]);
  await assert.rejects(files.resolve('.GiT/config'), /protected/);
  await assert.rejects(files.resolve('.AGENTDEMO/new', true), /protected/);
});
test('Docker masks metadata directories and rejects metadata pointer files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentdemo-mask-'));
  await mkdir(join(root, '.GiT'));
  assert.deepEqual(dockerMetadataMasks(root), [
    '--tmpfs',
    '/workspace/.GiT:ro,noexec,nosuid,size=1m,mode=000',
  ]);
  await mkdir(join(root, 'nested'));
  await writeFile(join(root, 'nested', '.git'), 'gitdir: outside');
  assert.throws(() => dockerMetadataMasks(root), /Metadata file/);
});
test('typed outcomes override misleading output text; command timeout never proves success', () => {
  assert.equal(
    resultSucceeded({ outcome: { status: 'succeeded' }, output: 'Tool error: quoted example' }),
    true,
  );
  assert.equal(resultSucceeded({ outcome: { status: 'failed' }, output: 'all passed' }), false);
  assert.equal(
    resultSucceeded({ name: 'run_command', output: JSON.stringify({ code: 1 }) }),
    false,
  );
  assert.equal(commandOutcome({ code: 0, timedOut: true }).status, 'unknown');
  assert.equal(commandOutcome({ code: 0 }).status, 'succeeded');
});
test('limits and protocol failures have recoverable typed reasons', () => {
  assert.deepEqual(termination(new AppError('STEP_LIMIT', 'limit')), {
    code: 'STEP_LIMIT',
    category: 'limit',
    recoverable: true,
  });
  assert.equal(termination(new AppError('MODEL_INCOMPLETE', 'length')).category, 'protocol');
  assert.equal(termination(new Error('bug')).recoverable, false);
});
test('idle SSE times out even when stream cancellation never settles', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
        return new Promise(() => {});
      },
    }),
  );
  await assert.rejects(
    async () => {
      for await (const _ of sse(response, 15)) {
      }
    },
    (e: any) => e.code === 'MODEL_STREAM_IDLE',
  );
  assert.equal(cancelled, true);
});

test('edit recovery needs an exact host-recorded postimage, not a matching fragment', async () => {
  const { Store } = await import('../server/storage/store.js');
  const { inspectEffects } = await import('../server/services/recovery.js');
  const { createHash } = await import('node:crypto');
  const root = await mkdtemp(join(tmpdir(), 'agentdemo-reconcile-'));
  const store = new Store(join(root, 'state.sqlite'));
  const files = new FileScope([root]);
  try {
    store.put('run', { id: 'r', conversationId: 'c', status: 'interrupted' });
    const key = store.beginEffect('r', 'edit_file', {
      path: 'a.txt',
      oldText: 'old',
      newText: 'new',
    });
    await files.write('a.txt', 'prefix new suffix changed');
    store.event('c', 'r', 'effect.expected', {
      effectId: key,
      path: 'a.txt',
      sha256: createHash('sha256').update('prefix new suffix').digest('hex'),
    });
    assert.equal((await inspectEffects(store, files, 'c')).unresolved.length, 1);
    await files.write('a.txt', 'prefix new suffix');
    assert.deepEqual((await inspectEffects(store, files, 'c')).resolved, [key]);
    assert.equal(store.unknownEffects('c').length, 0);
  } finally {
    store.close();
  }
});
