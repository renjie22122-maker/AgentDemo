import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cases } from './cases.js';
import { grade } from './grading.js';
import { Configuration } from '../../server/services/settings.js';
const option = (key: string, def: string) =>
  process.argv.find((a) => a.startsWith('--' + key + '='))?.slice(key.length + 3) || def;
const num = (key: string, def: string, max: number) => {
  const n = Number(option(key, def));
  if (!Number.isInteger(n) || n < 1 || n > max) throw Error('Invalid ' + key);
  return n;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export async function preflight() {
  for (const c of cases) {
    if (!(await grade(c.reference, c.checks)).passed) throw Error('Reference rejected: ' + c.id);
    if ((await grade('module.exports=()=>({deliberatelyWrong:true})', c.checks)).passed)
      throw Error('Negative control accepted: ' + c.id);
  }
  if ((await grade('module.exports=()=>{while(true){}}', [{ input: null, output: null }])).passed)
    throw Error('Infinite loop accepted');
  console.log(
    JSON.stringify({ preflight: 'passed', tasks: cases.length, controls: cases.length * 2 + 1 }),
  );
}
await preflight();
if (process.argv.includes('--preflight')) process.exit(0);
if (!process.argv.includes('--live'))
  throw Error('Use --preflight or --live. Live uses the configured paid API.');
const selected = cases.slice(0, num('limit', '10', cases.length)),
  repeats = num('repeats', '1', 20),
  seconds = num('seconds', '180', 1800),
  steps = num('steps', '16', 100);
const directory = resolve(option('output', '.diagnostics/coding-' + Date.now()));
// Reports and credentials-free runtime traces must remain outside the agent workspace.
await mkdir(directory, { recursive: true });
const settings = resolve(option('settings', '.data/settings.json'));
const cfg = new Configuration(settings),
  profile = cfg.profile(option('profile', cfg.get().defaultProfileId));
const git = async (args: string[]) =>
  (await promisify(execFile)('git', args, { windowsHide: true })).stdout.trim();
const commit = await git(['rev-parse', 'HEAD']);
const diff = await git(['diff', 'HEAD', '--', 'server', 'shared']);
const harnessHash = hash(
  (
    await Promise.all(
      ['run.ts', 'worker.ts', 'adapter.ts', 'cases.ts', 'grading.ts', 'grader-worker.cjs'].map(
        (p) => readFile(new URL(p, import.meta.url), 'utf8'),
      ),
    )
  ).join('\n'),
);
const manifest = {
  schemaVersion: 1,
  kind: 'synthetic-coding-runtime-pilot',
  commit,
  runtimeDiffHash: hash(diff),
  harnessHash,
  catalogHash: hash(JSON.stringify(cases)),
  model: profile.model,
  transport: profile.transport,
  endpoint: profile.baseUrl,
  reasoning: profile.reasoning,
  contextWindow: profile.contextWindow,
  maxOutputTokens: 4096,
  prices: profile.prices,
  taskIds: selected.map((c) => c.id),
  taskCount: selected.length,
  repeats,
  arms: ['optimized', 'read-reuse-off'],
  expectedRuns: selected.length * repeats * 2,
  limits: { seconds, steps },
  environment: { platform: process.platform, node: process.version },
  parallel: 1,
  caveats: [
    'Synthetic public tasks, not real-repository or unseen benchmark.',
    'Only read-result reuse ablated; provider caching cannot be cleared.',
    'No team arm yet.',
    'Small sample; no performance superiority claim.',
  ],
};
const manifestFile = join(directory, 'manifest.json');
try {
  const previous = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (JSON.stringify(previous) !== JSON.stringify(manifest))
    throw Error('Manifest mismatch; use new output directory.');
} catch (e: any) {
  if (e.code === 'ENOENT') await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  else throw e;
}
const rows: any[] = [];
for (let repeat = 0; repeat < repeats; repeat++)
  for (let index = 0; index < selected.length; index++) {
    const c = selected[index],
      arms =
        (repeat + index) % 2 ? ['read-reuse-off', 'optimized'] : ['optimized', 'read-reuse-off'];
    for (const arm of arms) {
      const key = c.id + '-' + repeat + '-' + arm,
        dir = join(directory, key),
        rowFile = join(dir, 'score.json');
      try {
        rows.push(JSON.parse(await readFile(rowFile, 'utf8')));
        continue;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      const marker = join(dir, 'started.json');
      let exists = false;
      try {
        await stat(marker);
        exists = true;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      await mkdir(dir, { recursive: true });
      let result: any;
      if (exists) {
        // Score a durably completed result if available, but never rerun an uncertain model/tool operation.
        try {
          result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
        } catch {
          result = { status: 'interrupted_unknown', metrics: null, source: null };
        }
      } else {
        const prompt =
          'Implement solution.cjs as CommonJS module.exports = function(input). Only use provided file tools. Do not run commands or delegate. Return JSON-serializable output; do not mutate input. Task: ' +
          c.brief +
          '\nExample: ' +
          JSON.stringify(c.example) +
          '\nRead back the completed file to check your work. Then briefly explain the solution.';
        await writeFile(
          join(dir, 'job.json'),
          JSON.stringify({
            id: c.id,
            arm,
            prompt,
            settings,
            profileId: profile.id,
            directory: dir,
            seconds,
            steps,
          }),
        );
        await writeFile(marker, JSON.stringify({ startedAt: new Date().toISOString() }), {
          flag: 'wx',
        });
        try {
          await promisify(execFile)(
            process.execPath,
            [
              '--import',
              'tsx',
              fileURLToPath(new URL('./worker.ts', import.meta.url)),
              join(dir, 'job.json'),
            ],
            { timeout: (seconds + 20000 / 1000) * 1000, maxBuffer: 1024 * 1024, windowsHide: true },
          );
          result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
        } catch {
          result = { status: 'infrastructure_or_worker_timeout', metrics: null, source: null };
        }
      }
      const graded =
        result.source === null
          ? { passed: false, checks: 0, error: 'missing_artifact' }
          : await grade(result.source, c.checks);
      const row = {
        id: c.id,
        repeat,
        arm,
        status: result.status,
        pass: result.status === 'completed' && graded.passed,
        artifactPass: graded.passed,
        falseCompletion: result.status === 'completed' && !graded.passed,
        grading: graded,
        metrics: result.metrics,
        termination: result.termination || null,
      };
      await writeFile(rowFile, JSON.stringify(row, null, 2));
      rows.push(row);
      console.log(JSON.stringify({ completed: rows.length, total: manifest.expectedRuns, ...row }));
      await report();
    }
  }
await report();
async function report() {
  const summaries = manifest.arms.map((arm) => {
    const r = rows.filter((x) => x.arm === arm),
      known = r.filter((x) => x.metrics),
      passes = r.filter((x) => x.pass).length;
    const allCosts =
      r.length > 0 &&
      r.every((x) => x.metrics?.estimatedUsd !== null && x.metrics?.estimatedUsd !== undefined);
    const cost = allCosts ? r.reduce((n, x) => n + x.metrics.estimatedUsd, 0) : null;
    return {
      arm,
      attempts: r.length,
      passed: passes,
      failed: r.length - passes,
      successRate: r.length ? passes / r.length : null,
      falseCompletions: r.filter((x) => x.falseCompletion).length,
      unknownMetrics: r.length - known.length,
      observedInputTokens: known.reduce((n, x) => n + x.metrics.inputTokens, 0),
      observedCachedInputTokens: known.reduce((n, x) => n + x.metrics.cachedInputTokens, 0),
      observedOutputTokens: known.reduce((n, x) => n + x.metrics.outputTokens, 0),
      estimatedUsd: cost,
      costPerSuccess: cost !== null && passes ? cost / passes : null,
      restoredMessages: known.reduce((n, x) => n + x.metrics.restoredMessages, 0),
      reuseEvents: known.reduce((n, x) => n + x.metrics.reuseEvents, 0),
      medianElapsedMs: known.length
        ? known.map((x) => x.metrics.elapsedMs).sort((a, b) => a - b)[Math.floor(known.length / 2)]
        : null,
    };
  });
  await writeFile(
    join(directory, 'report.json'),
    JSON.stringify(
      { schemaVersion: 1, manifest, completed: rows.length, summaries, results: rows },
      null,
      2,
    ),
  );
}
console.log('Report: ' + join(directory, 'report.json'));
