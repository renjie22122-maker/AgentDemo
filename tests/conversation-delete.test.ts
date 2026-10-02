import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/storage/store.js';
import { deleteConversation } from '../server/services/conversation-delete.js';
test('permanent delete requires confirmation, rejects active work, preserves files/memories/forks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chat-delete-'));
  const store = new Store(join(dir, 'db.sqlite'));
  try {
    for (const [id, parentId, forkEvent] of [
      ['root', null, null],
      ['child', 'root', null],
      ['fork', 'root', 10],
      ['other', null, null],
    ] as const)
      store.put('conversation', {
        id,
        title: id,
        parentId,
        forkEvent,
        projectId: 'project',
        createdAt: 1,
      });
    store.put('project', { id: 'project', folders: ['not-owned'] });
    store.put('memory', { id: 'memory', sourceConversationId: 'root', content: 'keep' });
    store.put('run', {
      id: 'run',
      conversationId: 'root',
      status: 'running',
      createdAt: 1,
      checkpoints: [{ role: 'user', content: 'secret' }],
    });
    store.event('root', 'run', 'user.message', { text: 'secret' });
    store.event('fork', null, 'user.message', { text: 'independent copy' });
    store.put('feedback', { id: 'feedback', conversationId: 'root' });
    store.put('attachment', { id: 'attachment', conversationId: 'root' });
    store.put('memory-learning', { id: 'learning', conversationId: 'root' });
    await mkdir(join(dir, 'attachments', 'attachment'), { recursive: true });
    await writeFile(join(dir, 'attachments', 'attachment', 'file.txt'), 'attachment');
    await mkdir(join(dir, 'chats', 'root', 'files'), { recursive: true });
    await writeFile(join(dir, 'chats', 'root', 'files', 'artifact.txt'), 'artifact');
    await writeFile(join(dir, 'keep-project.txt'), 'project unchanged');
    assert.throws(
      () => deleteConversation(store, dir, 'root', 'wrong'),
      /exact conversation title/,
    );
    assert.throws(() => deleteConversation(store, dir, 'root', 'root'), /Stop this conversation/);
    assert.ok(store.maybe('conversation', 'root'));
    store.put('run', { ...store.get<any>('run', 'run'), status: 'completed' });
    const result = deleteConversation(store, dir, 'root', 'root');
    assert.deepEqual(result.deleted, ['root', 'child']);
    assert.equal(store.maybe('conversation', 'root'), undefined);
    assert.equal(store.maybe('run', 'run'), undefined);
    assert.equal(store.runMetadata().length, 0);
    assert.equal(store.events('root').length, 0);
    assert.equal(store.maybe('attachment', 'attachment'), undefined);
    assert.equal(store.maybe('feedback', 'feedback'), undefined);
    assert.equal(store.maybe('memory-learning', 'learning'), undefined);
    assert.equal(store.get<any>('conversation', 'fork').parentId, null);
    assert.equal(store.events('fork').length, 1);
    assert.ok(store.maybe('memory', 'memory'));
    assert.ok(store.maybe('project', 'project'));
    assert.equal(await readFile(join(dir, 'keep-project.txt'), 'utf8'), 'project unchanged');
    await assert.rejects(access(join(dir, 'chats', 'root')));
    await assert.rejects(access(join(dir, 'attachments', 'attachment')));
  } finally {
    store.close();
  }
});
