import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { McpHub } from '../server/services/mcp.js';
import { execute } from '../server/services/process.js';
import { Configuration } from '../server/services/settings.js';
import { Store } from '../server/storage/store.js';
import { Embeddings } from '../server/services/embedding.js';
import { Knowledge } from '../server/services/knowledge.js';
import { extract } from '../server/services/documents.js';
test('real stdio MCP handshake, discovery, call and close', async () => {
  const hub = new McpHub(),
    server = {
      id: 'fixture',
      name: 'Fixture',
      enabled: true,
      command: process.execPath,
      args: ['--import', 'tsx', resolve('tests/fixtures/mcp-server.ts')],
    };
  try {
    const catalog = await hub.list(server);
    assert.equal(catalog[0].name, 'echo');
    const result = await hub.call(
      server,
      'echo',
      { text: 'bounded fixture' },
      new AbortController().signal,
    );
    assert.equal((result.content as any[])[0].text, 'bounded fixture');
    await assert.rejects(hub.call(server, 'unknown', {}, new AbortController().signal));
  } finally {
    await hub.close();
  }
});
test('host backend reports actual exit code and output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-command-')),
    config = new Configuration(join(dir, 'settings.json'));
  const result = await execute(
    'echo approved-fixture',
    dir,
    new AbortController().signal,
    5000,
    config.get(),
  );
  assert.equal(result.code, 0);
  assert.match(result.stdout, /approved-fixture/);
  assert.equal(result.timedOut, false);
});
test('command timeout terminates the owned process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-timeout-')),
    config = new Configuration(join(dir, 'settings.json'));
  const command = '"' + process.execPath + '" -e "setInterval(function(){},1000)"';
  const start = Date.now();
  const result = await execute(command, dir, new AbortController().signal, 300, config.get());
  assert.equal(result.timedOut, true);
  assert(Date.now() - start < 10000);
});
test('hybrid retrieval uses configured vectors but never another scope', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-hybrid-')),
    store = new Store(join(dir, 'db.sqlite'));
  const embeddings = new Embeddings(() => ({
    baseUrl: 'https://embedding.example',
    apiKey: 'test-only',
    model: 'fixture',
  }));
  t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
    const { input } = JSON.parse(options.body);
    return Response.json({
      data: input.map((text: string, index: number) => ({
        index,
        embedding: text.includes('car') || text.includes('automobile') ? [1, 0] : [0, 1],
      })),
    });
  });
  const kb = new Knowledge(store, embeddings),
    a = kb.import('project:a', 'vehicle.txt', 'automobile propulsion uses an engine') as any,
    b = kb.import('project:b', 'private.txt', 'car secret belongs elsewhere') as any;
  await kb.index(a.id);
  await kb.index(b.id);
  const result = await kb.hybrid(['project:a'], 'car', 3);
  assert.equal(result[0].name, 'vehicle.txt');
  assert(result.every((r) => r.scope === 'project:a'));
  store.close();
});
test('CSV and XLSX extraction preserve cells', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-doc-'));
  const csv = join(dir, 'data.csv');
  await writeFile(csv, 'name,value\nalpha,17\n');
  assert((await extract(csv)).includes('alpha,17'));
  const { default: Excel } = await import('exceljs');
  const book = new Excel.Workbook();
  book.addWorksheet('Data').addRows([
    ['name', 'value'],
    ['beta', 42],
  ]);
  const xlsx = join(dir, 'data.xlsx');
  await book.xlsx.writeFile(xlsx);
  assert((await extract(xlsx)).includes('beta'));
  assert((await extract(xlsx)).includes('42'));
});
test('public configuration exposes key presence but never the key value', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-config-'));
  const config = new Configuration(join(dir, 'settings.json'));
  config.save({
    ...config.get(),
    profiles: [
      {
        id: 'p',
        name: 'p',
        transport: 'openai-chat',
        baseUrl: 'https://example.com',
        apiKey: 'never-return-this',
        model: 'm',
      },
    ],
    defaultProfileId: 'p',
  });
  assert(!JSON.stringify(config.public()).includes('never-return-this'));
  assert.equal(config.public().profiles[0].hasKey, true);
  assert((await readFile(join(dir, 'settings.json'), 'utf8')).includes('never-return-this'));
});

test('host command chains preserve their tail and large output declares truncation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-output-'));
  const config = new Configuration(join(dir, 'settings.json'));
  const chain =
    process.platform === 'win32'
      ? 'echo FIRST & echo SECOND & echo FINAL'
      : 'echo FIRST; echo SECOND; echo FINAL';
  const result = await execute(chain, dir, new AbortController().signal, 5000, config.get());
  assert.equal(result.code, 0);
  assert.match(result.stdout, /FIRST[\s\S]*SECOND[\s\S]*FINAL/);
  assert.equal(result.truncated, false);
  await writeFile(join(dir, 'output.cjs'), "process.stdout.write('x'.repeat(1100000)+'TAIL')");
  const large = await execute(
    '"' + process.execPath + '" output.cjs',
    dir,
    new AbortController().signal,
    10000,
    config.get(),
  );
  assert.equal(large.code, 0);
  assert.equal(large.truncated, true);
  assert.equal(large.stdout.length, 1000000);
});

test('credential reuse is origin-bound and diagnostic configuration omits persisted secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'config-scope-')),
    path = join(dir, 'settings.json'),
    config = new Configuration(path, { persistSecrets: false });
  const p = {
    id: 'p',
    name: 'p',
    transport: 'openai-chat',
    baseUrl: 'https://original.example',
    apiKey: 'fixture-secret',
    model: 'm',
  };
  config.save({ ...config.get(), profiles: [p], defaultProfileId: 'p' });
  assert.equal(config.get().profiles[0].apiKey, 'fixture-secret');
  assert.ok(!(await readFile(path, 'utf8')).includes('fixture-secret'));
  config.save({
    ...config.get(),
    profiles: [{ ...p, apiKey: undefined, baseUrl: 'https://other.example' }],
  });
  assert.equal(config.get().profiles[0].apiKey, '');
});
