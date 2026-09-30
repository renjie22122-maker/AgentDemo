import { Store } from '../../server/storage/store.js';
import { Teams } from '../../server/services/team-space.js';
import { TaskBoard } from '../../server/services/task-board.js';
import {
  prepareCoordination,
  commitCoordination,
} from '../../server/services/coordination-journal.js';
const [file, phase] = process.argv.slice(2),
  store = new Store(file);
const root = {
  id: 'root',
  conversationId: 'root',
  parentRunId: null,
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
  depth: 0,
  modelCalls: 0,
  estimatedUsd: null,
} as any;
const peer = { ...root, id: 'peer', conversationId: 'peer', parentRunId: 'root', depth: 1 };
for (const r of [root, peer]) {
  store.put('run', r);
  store.put('conversation', {
    id: r.conversationId,
    permission: 'read-only',
    teamMode: 'host',
    teamStrategy: 'auto',
  });
}
new Teams(store).configure(root, 'host', ['root', 'peer'], 12);
const board = new TaskBoard(store);
board.create(root, [{ id: 'a', title: 'Read', dependsOn: [], acceptance: 'Evidence' }], 0);
const args = {
  id: 'a',
  revision: board.get(root).revision,
  status: 'running',
  evidence: [],
  note: 'claimed',
};
store.event('peer', 'peer', 'tool.started', {
  callId: 'claim',
  name: 'update_task',
  arguments: args,
});
if (phase === 'legacy') {
  board.update(peer, 'a', args.revision, 'running', [], 'claimed');
  process.exit(23);
}
const receipt = prepareCoordination(store, peer, 'claim', 'update_task', args, true);
if (phase === 'before') process.exit(23);
commitCoordination(store, receipt, () => {
  const updated = board.update(peer, 'a', args.revision, 'running', [], 'claimed');
  if (phase === 'inside') process.exit(23);
  return { content: JSON.stringify(updated) };
});
process.exit(23);
