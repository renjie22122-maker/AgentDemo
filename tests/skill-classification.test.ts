import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogStamp,
  validateClassification,
  SkillClassification,
} from '../server/services/skill-classification.js';
import { Store } from '../server/storage/store.js';
import { Configuration } from '../server/services/settings.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('classification rejects omissions, duplicates, invented ids and stale previews; apply is local', async () => {
  const skills = [
    { id: 'a', name: 'PDF', description: 'Read documents' },
    { id: 'b', name: 'Voice', description: 'Audio' },
  ] as any;
  const valid = {
    categories: [{ id: 'docs', labelEn: 'Docs', labelZh: '文档' }],
    assignments: skills.map((s: any) => ({ id: s.id, categories: ['docs'] })),
  };
  assert.equal(validateClassification(valid, skills).assignments.length, 2);
  for (const value of [
    { ...valid, assignments: valid.assignments.slice(1) },
    { ...valid, assignments: [valid.assignments[0], valid.assignments[0]] },
    { ...valid, assignments: [{ id: 'a', categories: ['fake'] }, valid.assignments[1]] },
  ])
    assert.throws(() => validateClassification(value, skills));
  const dir = await mkdtemp(join(tmpdir(), 'classify-')),
    store = new Store(join(dir, 'db.sqlite'));
  try {
    for (const s of skills) store.put('skill', s);
    store.put('skill-classification', { id: 'draft', stamp: catalogStamp(skills), ...valid });
    const svc = new SkillClassification(store, new Configuration(join(dir, 'settings.json')));
    assert.equal(svc.apply('draft').applied, 2);
    assert.equal(store.get<any>('skill', 'a').categories[0].id, 'docs');
    store.put('skill', { ...skills[0], description: 'Changed' });
    assert.throws(() => svc.apply('draft'), /changed/);
  } finally {
    store.close();
  }
});
