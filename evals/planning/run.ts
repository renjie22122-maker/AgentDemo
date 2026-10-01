import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { Configuration } from '../../server/services/settings.js';
import { providerFor } from '../../server/providers/registry.js';
import { taskInput } from '../../server/services/task-board.js';
import { TASK_PLANNING } from '../../server/core/prompts.js';
import { validateTaskGraph } from '../../server/services/task-graph.js';
import { cases } from './cases.js';
import { gradePlan } from './grade.js';
import { writePlanningReport } from './report.js';
const value = (name: string, fallback: string) =>
  process.argv
    .find((x) => x.startsWith('--' + name + '='))
    ?.split('=')
    .slice(1)
    .join('=') || fallback;
const output = resolve(value('output', '.diagnostics/planning-' + Date.now()));
async function run() {
  const runs = Number(value('runs', '3')),
    parallel = Number(value('parallel', '2'));
  if (
    !Number.isInteger(runs) ||
    runs < 1 ||
    runs > 10 ||
    !Number.isInteger(parallel) ||
    parallel < 1 ||
    parallel > 4
  )
    throw Error('Use runs 1..10 and parallel 1..4');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).some((n) => n.endsWith('.json')))
    throw Error('Output contains results; use a fresh directory or --report-only. No calls made.');
  const config = new Configuration(value('settings', '.data/settings.json'));
  const profile = config.profile(value('profile', config.get().defaultProfileId));
  const selected = cases.filter(
    (c) => value('split', 'all') === 'all' || c.split === value('split', 'all'),
  );
  if (!selected.length) throw Error('No selected cases');
  const schema = z.object({ tasks: taskInput.array().min(1).max(50) });
  const spec = {
    name: 'propose_plan',
    effect: 'coordinate' as const,
    description:
      'Return the requested task graph. Declare dependencies or provides/requires contracts. Do not execute the plan.',
    parameters: z.toJSONSchema(schema),
  };
  const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
  const configSnapshot = {
    model: profile.model,
    transport: profile.transport,
    reasoning: profile.reasoning,
    maxOutputTokens: profile.maxOutputTokens,
    runs,
    cases: selected.length,
    parallel,
    catalogHash: hash(await readFile(new URL('./cases.ts', import.meta.url))),
    prices: profile.prices,
    evaluationStage: value('stage', 'regression'),
    policyHash: hash(TASK_PLANNING),
    schemaHash: hash(JSON.stringify(spec)),
  };
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(configSnapshot, null, 2));
  const jobs = selected
    .flatMap((c) =>
      Array.from({ length: runs }, (_, repeat) =>
        (repeat % 2 ? ['contract', 'baseline'] : ['baseline', 'contract']).map((arm) => ({
          c,
          repeat,
          arm,
        })),
      ),
    )
    .flat();
  let index = 0,
    completed = 0;
  async function worker() {
    while (index < jobs.length) {
      const { c, repeat, arm } = jobs[index++];
      const started = performance.now();
      const attempts: any[] = [];
      const messages: any[] = [
        {
          role: 'system',
          content:
            'Plan only. Call propose_plan once with concise titles and acceptance criteria. Use exactly the requested task IDs, no additional tasks. Do not call external tools.' +
            (arm === 'contract' ? '\n' + TASK_PLANNING : ''),
        },
        {
          role: 'user',
          content:
            c.brief +
            '\nTask IDs: ' +
            c.tasks.join(', ') +
            '. These are planned tasks; do not execute them. ' +
            (c.readOnly
              ? 'Execution scope: read-only; no isolated/write tasks.'
              : 'Set execution=isolated only for tasks that change files.'),
        },
      ];
      let row: any = { caseId: c.id, split: c.split, repeat, arm, pass: false };
      try {
        for (let attempt = 0; attempt < (arm === 'contract' ? 2 : 1); attempt++) {
          const r = await providerFor(profile)
            .complete({
              profile,
              messages,
              tools: [spec],
              signal: AbortSignal.timeout(profile.timeoutMs),
              onText: () => {},
            })
            .catch((error) => {
              row.usageIncomplete = true;
              throw error;
            });
          attempts.push({ usage: r.usage });
          const call = r.message.calls?.find((x) => x.name === 'propose_plan');
          if (!call) throw Error('No plan tool call');
          const parsed = schema.parse(call.arguments);
          row.tasks = parsed.tasks;
          try {
            validateTaskGraph(parsed.tasks, c.readOnly);
          } catch (error) {
            if (arm === 'contract' && attempt === 0) {
              messages.push(r.message);
              for (const tool of r.message.calls || [])
                messages.push({
                  role: 'tool',
                  callId: tool.id,
                  name: tool.name,
                  content:
                    tool.id === call.id
                      ? 'Host validation rejected the proposal: ' + String(error)
                      : 'Not executed.',
                });
              continue;
            }
          }
          row = { ...row, ...gradePlan(c, parsed.tasks) };
          break;
        }
      } catch (error) {
        row.error = error instanceof Error ? error.message : 'API failure';
      }
      row.attempts = attempts;
      row.elapsedMs = Math.round(performance.now() - started);
      await writeFile(
        resolve(output, c.id + '-' + repeat + '-' + arm + '.json'),
        JSON.stringify(row, null, 2),
      );
      console.log(
        JSON.stringify({
          completed: ++completed,
          total: jobs.length,
          case: c.id,
          repeat,
          arm,
          pass: row.pass,
          error: row.error || null,
        }),
      );
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
}
if (!process.argv.includes('--report-only')) await run();
const report = await writePlanningReport(output);
console.log(JSON.stringify({ output, summaries: report.summaries }));
