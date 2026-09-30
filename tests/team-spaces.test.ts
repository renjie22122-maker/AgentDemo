import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/storage/store.js';
import { Teams } from '../server/services/team-space.js';
import { TaskBoard } from '../server/services/task-board.js';
import { TeamScheduler } from '../server/services/team-scheduler.js';
function fixture(mode: 'host' | 'creative' = 'host') {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'peers-')), 'db.sqlite'));
  const lead = {
    id: 'lead',
    conversationId: 'lead',
    parentRunId: null,
    status: 'running',
    createdAt: 1,
    depth: 0,
  } as any;
  const a = { ...lead, id: 'a', conversationId: 'a', parentRunId: 'lead', depth: 1 };
  const b = { ...a, id: 'b', conversationId: 'b' };
  for (const r of [lead, a, b]) {
    store.put('run', r);
    store.put('conversation', {
      id: r.conversationId,
      teamMode: mode,
      teamStrategy: 'auto',
      permission: 'read-only',
    });
  }
  return {
    store,
    lead,
    a,
    b,
    teams: new Teams(store),
    board: new TaskBoard(store),
    scheduler: new TeamScheduler(store),
  };
}
test('host task allocation survives coordinator interruption; role handoff is audited and revision checked', () => {
  const f = fixture();
  try {
    const t = f.teams.configure(f.lead, 'host', ['lead', 'a', 'b'], 12);
    f.board.create(f.lead, [{ id: 'one', title: 'one', dependsOn: [], acceptance: 'read' }], 0);
    f.scheduler.configure(f.lead, ['a', 'b'], 1, true);
    f.teams.handoff(f.lead, 'coordinator', 'a', t.revision, 'continue coordination');
    assert.throws(() => f.teams.handoff(f.lead, 'coordinator', 'b', 1, 'stale'), /revision/);
    assert.throws(() => f.scheduler.configure(f.lead, ['a'], 1, true), /lead/);
    f.store.put('run', { ...f.lead, status: 'interrupted' });
    const allocation = f.scheduler.dispatch(f.a);
    assert.equal(allocation.length, 1);
    assert.equal(f.teams.project(f.a)?.status, 'active');
    assert.equal(f.store.events('lead').filter((e) => e.type === 'team.lifecycle').length, 2);
  } finally {
    f.store.close();
  }
});
test('creative transcript is recipient scoped, limits are enforced, and closure is not factual consensus', () => {
  const f = fixture('creative');
  try {
    f.teams.configure(f.lead, 'creative', ['lead', 'a', 'b'], 1);
    const a = f.teams.post(f.a, 'Secret character motive', ['b']);
    assert.equal(f.teams.messages(f.lead).length, 0);
    assert.equal(f.teams.messages(f.b)[0].text, 'Secret character motive');
    const b = f.teams.post(f.b, 'Alternative idea', []);
    assert.notEqual(a.id, b.id);
    assert.throws(() => f.teams.post(f.a, 'loop', ['b']), /limit/);
    assert.throws(() => f.teams.post(f.lead, 'leak', ['stranger']), /Recipients/);
    for (const r of [f.lead, f.a, f.b]) {
      f.teams.close(r, 'my conclusion');
      f.store.put('run', { ...r, status: 'completed' });
    }
    assert.equal(f.teams.project(f.lead)?.status, 'completed');
    assert.match(f.teams.project(f.lead)!.basis, /not factual/);
  } finally {
    f.store.close();
  }
});
test('completion never ignores unknown effects, stale artifacts or unmerged isolation', () => {
  const f = fixture();
  try {
    f.teams.configure(f.lead, 'host', ['lead', 'a', 'b'], 12);
    f.board.create(
      f.lead,
      [{ id: 'one', title: 'one', dependsOn: [], acceptance: 'check', artifacts: ['a.txt'] }],
      0,
    );
    const e = f.store.beginEffect('a', 'run_command', {});
    assert.throws(() => f.teams.close(f.a, 'done'), /uncertain/);
    f.store.endEffect(e, 'confirmed');
    f.store.put('conversation', { id: 'a', isolationId: 'iso' });
    f.store.put('isolation', { id: 'iso', state: 'ready' });
    for (const r of [f.lead, f.a, f.b]) f.store.put('run', { ...r, status: 'completed' });
    const p = f.teams.project(f.lead)!;
    assert.equal(p.status, 'blocked');
    assert.equal(p.blockers.length, 2);
  } finally {
    f.store.close();
  }
});
test('team mode requires user selection; planner role can move without granting file access', () => {
  const f = fixture();
  try {
    assert.throws(() => f.teams.configure(f.lead, 'creative', ['lead', 'a'], 12), /Select/);
    const t = f.teams.configure(f.lead, 'host', ['lead', 'a', 'b'], 12);
    f.teams.handoff(f.lead, 'planner', 'a', t.revision, 'planning');
    assert.throws(
      () =>
        f.board.create(f.lead, [{ id: 'one', title: 'one', dependsOn: [], acceptance: 'read' }], 0),
      /lead/,
    );
    f.board.create(f.a, [{ id: 'one', title: 'one', dependsOn: [], acceptance: 'read' }], 0);
    assert.equal(f.store.get<any>('conversation', 'a').permission, 'read-only');
  } finally {
    f.store.close();
  }
});
