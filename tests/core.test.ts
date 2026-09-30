import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkTransition } from '../server/core/lifecycle.js';
import { parseArguments, reasoningFields, sse } from '../server/providers/protocol.js';
import { Knowledge } from '../server/services/knowledge.js';
import { publicAddress } from '../server/services/network.js';
import { FileScope, validateRoots } from '../server/services/paths.js';
import { profileSchema } from '../server/services/settings.js';
import { parseSkill } from '../server/services/skills.js';
import { Store } from '../server/storage/store.js';
test('lifecycle rejects resurrection and skipping approval', () => {
  assert.throws(() => checkTransition('completed', 'running'));
  assert.throws(() => checkTransition('waiting_approval', 'completed'));
  checkTransition('running', 'waiting_approval');
  checkTransition('waiting_approval', 'running');
});
test('strict tool arguments reject malformed JSON and arrays', () => {
  assert.throws(() => parseArguments('{bad}'));
  assert.throws(() => parseArguments('[]'));
  assert.deepEqual(parseArguments('{"a":1}'), { a: 1 });
});
test('SSE handles every byte boundary including CRLF and Chinese UTF-8', async () => {
  const bytes = new TextEncoder().encode(
    'event: delta\r\ndata: {"text":"浣犲ソ"}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    }),
  );
  const out = [];
  for await (const e of sse(response)) out.push(e);
  assert.deepEqual(out, [{ text: '浣犲ソ' }]);
});
test('SSE rejects an interrupted JSON frame', async () => {
  await assert.rejects(async () => {
    for await (const e of sse(new Response('data: {"x":'))) {
      void e;
    }
  });
});
test('unsupported reasoning never silently disappears', () => {
  const p = profileSchema.parse({
    id: 'a',
    name: 'a',
    baseUrl: 'https://example.com',
    transport: 'openai-chat',
    model: 'm',
  });
  assert.throws(() => reasoningFields({ ...p, reasoning: 'high' }));
  assert.deepEqual(
    reasoningFields({
      ...p,
      reasoning: 'none',
      efforts: ['auto', 'none'],
      reasoningFormat: 'deepseek',
    }),
    { thinking: { type: 'disabled' } },
  );
});
test('YAML folded and multiline skill descriptions are actually parsed', () => {
  const x = parseSkill(
    '---\nname: example\ndescription: >\n  First line\n  second line\n---\nBody',
  );
  assert.equal(x.description.trim(), 'First line second line');
  assert.equal(x.content, 'Body');
});
test('private and mapped network addresses cannot be web-tool targets', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.1.1',
    '172.16.0.1',
    '192.168.2.1',
    '169.254.169.254',
    '100.100.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
});
test('file scope rejects traversal and supports multiple roots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-path-'));
  const a = join(dir, 'a'),
    b = join(dir, 'b');
  await mkdir(a);
  await mkdir(b);
  const scope = new FileScope([a, b]);
  await scope.write('@1/report.txt', 'hello');
  assert.equal(await readFile(join(b, 'report.txt'), 'utf8'), 'hello');
  await assert.rejects(scope.read('../b/report.txt'));
  await assert.rejects(scope.write('.git/config', 'bad'));
  await assert.rejects(scope.write('@2/no.txt', 'bad'));
  await assert.rejects(validateRoots([a, dir]));
  await assert.rejects(validateRoots([dir], a));
});
test('knowledge never crosses scopes and citations retain scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-kb-'));
  const store = new Store(join(dir, 'test.db'));
  const kb = new Knowledge(store);
  kb.import('session:a', 'a.txt', 'alpha project secret cobalt penguin');
  kb.import('session:b', 'b.txt', 'alpha unrelated');
  const results = kb.search(['session:a'], 'cobalt');
  assert.equal(results.length, 1);
  assert.equal(results[0].scope, 'session:a');
  assert.equal(kb.search(['session:b'], 'cobalt').length, 0);
  store.close();
});
test('effect journal preserves unknown operations until explicit inspection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-effects-'));
  const store = new Store(join(dir, 'test.db'));
  store.put('run', { id: 'run', conversationId: 'chat', createdAt: 1 });
  const key = store.beginEffect('run', 'write_file', { path: 'x' });
  assert.equal(store.unknownEffects('chat').length, 1);
  assert.throws(() => store.resolveEffect(key, ''));
  store.resolveEffect(key, 'Confirmed x contains the new text.');
  assert.equal(store.unknownEffects('chat').length, 0);
  store.close();
});

test('real root spelling differences do not disable file access; ancestor links remain denied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentdemo-root-spelling-'));
  const root = join(dir, 'MixedCaseRoot');
  await mkdir(root);
  const spelling = process.platform === 'win32' ? root.toUpperCase() : root;
  const scope = new FileScope([spelling]);
  await scope.write('result.txt', 'ok');
  assert.equal(await scope.read('result.txt'), 'ok');
  const link = join(dir, 'alias');
  await symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  await mkdir(join(root, 'nested'));
  await assert.rejects(new FileScope([join(link, 'nested')]).list(), { code: 'LINKED_ROOT' });
});
