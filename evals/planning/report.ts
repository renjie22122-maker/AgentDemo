import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Profile } from '../../shared/types.js';
export function summarizePlanning(results: any[], prices: Profile['prices']) {
  return ['baseline', 'contract'].map((arm) => {
    const rows = results.filter((r) => r.arm === arm),
      calls = rows.flatMap((r) => r.attempts || []);
    const measured = calls.filter((c) => c.usage?.measured);
    const sum = (key: string) => measured.reduce((n, c) => n + (c.usage[key] || 0), 0);
    const priced = prices.input !== null && prices.output !== null && prices.cached !== null;
    const incompleteUsage =
      rows.some((r) => r.usageIncomplete || (r.error && !r.attempts?.length)) ||
      calls.length !== measured.length;
    const estimatedUsd =
      priced && !incompleteUsage
        ? measured.reduce(
            (n, c) =>
              n +
              (Math.max(0, c.usage.input - c.usage.cached) * prices.input! +
                c.usage.cached * prices.cached! +
                c.usage.output * prices.output!) /
                1e6,
            0,
          )
        : null;
    const splits = ['development', 'holdout'].map((split) => {
      const s = rows.filter((r) => r.split === split);
      return { split, samples: s.length, passed: s.filter((r) => r.pass).length };
    });
    return {
      arm,
      samples: rows.length,
      passed: rows.filter((r) => r.pass).length,
      failed: rows.filter((r) => !r.pass).length,
      splits,
      successfulResponses: calls.length,
      measuredUsageResponses: measured.length,
      usageIncomplete: incompleteUsage,
      elapsedMs: rows.reduce((n, r) => n + r.elapsedMs, 0),
      inputTokens: sum('input'),
      outputTokens: sum('output'),
      cachedTokens: sum('cached'),
      estimatedUsd,
    };
  });
}

export async function writePlanningReport(output: string) {
  const config = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
  const names = await readdir(output),
    results: any[] = [];
  for (const n of names.filter((n) => /-(baseline|contract)\.json$/.test(n)))
    results.push(JSON.parse(await readFile(resolve(output, n), 'utf8')));
  const expectedSamples = config.cases * config.runs * 2;
  const report = {
    schemaVersion: 1,
    kind: 'live-planning-comparison',
    createdAt: new Date().toISOString(),
    config,
    expectedSamples,
    completedSamples: results.length,
    complete: results.length === expectedSamples,
    summaries: summarizePlanning(results, config.prices),
    results,
    limitations: [
      'Synthetic planning tasks, not end-to-end coding tasks or measured worker throughput.',
      'Both arms use the same model/schema; contract arm adds planning policy and at most one host-validation retry, whose usage is included.',
      'Elapsed sum includes API waiting and is not makespan.',
      'Costs use configured prices, not provider bills. Missing usage is unknown, never zero. No tools executed or production conversations modified.',
    ],
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}
