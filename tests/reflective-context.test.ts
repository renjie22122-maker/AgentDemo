import test from 'node:test';
import assert from 'node:assert/strict';
import { reflectTasks } from '../server/core/reflection.js';
import { recallMemories } from '../server/services/memory-retrieval.js';
import { shouldAttachPaste, hasMarkdown, insertPaste } from '../src/composer-paste.js';
import type { Memory } from '../shared/types.js';
test('paste thresholds preserve small drafts, selected ranges and Markdown recognition', () => {
  assert(!shouldAttachPaste('short'));
  assert(shouldAttachPaste('a'.repeat(8000)));
  assert(shouldAttachPaste(Array(100).fill('line').join('\n')));
  assert(hasMarkdown('## Title\n$x^2$'));
  assert(hasMarkdown('\\(a+b\\)'));
  assert(!hasMarkdown('plain text'));
  assert.equal(insertPaste('abcd', 'XY', 1, 3), 'aXYd');
});
test('reflection does not equate done, receipts or self verification with correctness', () => {
  const task: any = {
    id: 'a',
    title: 'fix',
    acceptance: 'reject invalid input',
    status: 'done',
    owner: 'author',
    evidence: [1],
    dependsOn: [],
    note: '',
  };
  const unsupported = reflectTasks([task], 1, () => false);
  assert.equal(unsupported.coverage.evidenceSupported, 0);
  assert.equal(unsupported.nextAction, 'inspect-effects');
  const self = reflectTasks(
    [
      {
        ...task,
        verification: { status: 'checked', eventId: 1, independent: true, checkedBy: 'author' },
      },
    ],
    0,
    () => true,
  );
  assert.equal(self.coverage.independentChecks, 0);
  assert.equal(self.correctnessProbability, null);
  const stale = reflectTasks(
    [{ ...task, verification: { status: 'stale', eventId: 1 } }],
    0,
    () => true,
  );
  assert.equal(stale.coverage.recordedChecks, 0);
  assert.equal(stale.nextAction, 'investigate-or-verify');
  assert(stale.uncertainty[0].issues.includes('artifact-changed-since-check'));
});
const memory = (id: string, scope: string, value: string, conditions = ''): Memory => ({
  id,
  scope,
  value,
  conditions,
  content: 'package manager ' + value,
  entityId: 'package-manager',
  attribute: 'choice',
  active: true,
  status: 'active',
  revision: 1,
  createdAt: 1,
  expiresAt: null,
  source: 'user',
  recallScope: 'scope',
  decayPolicy: 'stable',
});
test('specific memory shadows only matching facts without deleting broader preferences', () => {
  const general = memory('g', 'user', 'pnpm');
  const local = memory('p', 'project:a', 'npm');
  const rows = [general, local, memory('foreign', 'project:b', 'yarn')];
  const found = recallMemories(rows, 'package manager', 'a');
  assert.deepEqual(
    found.map((m) => m.id),
    ['p'],
  );
  assert.deepEqual(found[0].broaderMemoryIds, ['g']);
  assert.equal(general.active, true);
  assert.deepEqual(
    recallMemories(rows, 'package manager', null).map((m) => m.id),
    ['g'],
  );
  const conditional = recallMemories(
    [general, { ...local, conditions: 'legacy releases' }],
    'package manager',
    'a',
  );
  assert.equal(conditional.length, 2);
  assert.equal(conditional.find((m) => m.id === 'p')?.applicability, 'check-conditions-before-use');
  const conflict = recallMemories(
    [local, memory('p2', 'project:a', 'pnpm')],
    'package manager',
    'a',
  );
  assert.equal(conflict.length, 2);
  assert.deepEqual(conflict[0].conflictingMemoryIds, [conflict[1].id]);
});
