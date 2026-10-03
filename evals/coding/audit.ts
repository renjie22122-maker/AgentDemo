import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { cases } from './cases.js';
import { grade } from './grading.js';
// Regrade existing immutable model outputs. Never invoke Runtime or providers.
const dir = resolve(process.argv[2] || '.diagnostics/coding-pilot-20261003');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
if (report.manifest.catalogHash !== hash(JSON.stringify(cases)))
  throw Error('Task catalog changed; cannot silently rescore.');
const rows = [];
for (const row of report.results) {
  const c = cases.find((c) => c.id === row.id)!;
  const result = JSON.parse(
    await readFile(join(dir, row.id + '-' + row.repeat + '-' + row.arm, 'result.json'), 'utf8'),
  );
  const grading = await grade(result.source || '', c.checks);
  rows.push({
    id: row.id,
    repeat: row.repeat,
    arm: row.arm,
    pass: result.status === 'completed' && grading.passed,
    grading,
  });
}
const audit = {
  schemaVersion: 1,
  kind: 'post-run-grader-audit',
  sourceHarnessHash: report.manifest.harnessHash,
  graderHash: hash(await readFile(new URL('./grader-worker.cjs', import.meta.url), 'utf8')),
  reason: 'Added input immutability check; no API calls or artifact writes repeated.',
  total: rows.length,
  passed: rows.filter((r) => r.pass).length,
  results: rows,
};
await writeFile(join(dir, 'grading-audit.json'), JSON.stringify(audit, null, 2));
console.log(
  JSON.stringify({ total: audit.total, passed: audit.passed, failed: audit.total - audit.passed }),
);
