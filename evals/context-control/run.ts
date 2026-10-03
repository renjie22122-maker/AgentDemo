import { actionAnswer } from './grading.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { Configuration } from '../../server/services/settings.js';
import { providerFor } from '../../server/providers/registry.js';
import { COMPACT } from '../../server/core/prompts.js';
import { sourceLedger } from '../../server/core/source-ledger.js';
import { usageCost } from '../../server/core/context-economics.js';
import {
  cognitivePolicy,
  initialCognitiveState,
  type Observation,
} from '../../server/core/cognitive-policy.js';
import type { ModelMessage } from '../../shared/types.js';
if (!process.argv.includes('--live'))
  throw Error('Pass --live to authorize paid synthetic model calls.');
const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] || 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw Error('runs must be 1..10');
const original = new Configuration(
  process.env.AGENTDEMO_SETTINGS || '.data/settings.json',
).profile();
const profile = {
  ...original,
  maxOutputTokens: 1024,
  reasoning: original.efforts.includes('none') ? ('none' as const) : original.reasoning,
};
const provider = providerFor(profile);
const records: any[] = [],
  summaries: any[] = [];
async function ask(messages: ModelMessage[]) {
  const at = Date.now();
  const result = await provider.complete({
    profile,
    messages,
    tools: [],
    signal: AbortSignal.timeout(90000),
    onText: () => {},
  });
  return {
    text: result.message.content,
    usage: result.usage,
    costUsd: usageCost(result.usage, profile.prices),
    latencyMs: Date.now() - at,
  };
}
const cases = [
  {
    id: 'bilingual',
    source:
      'Keep the public API version v1. 保留中文注释，日志保留期为17天。Output format is JSON.',
    expected: { version: 'v1', retention: 17, comments: 'Chinese' },
  },
  {
    id: 'revision',
    source:
      'Initially use API v1 and retention 30 days. Correction: use API v2 and retention 11 days. Keep Chinese comments.',
    expected: { version: 'v2', retention: 11, comments: 'Chinese' },
  },
];
const system: ModelMessage = {
  role: 'system',
  content:
    'Use supplied evidence. Return only the requested JSON or option, no tools. If a required fact is missing, use null. Do not invent missing facts.',
};
const query: ModelMessage = {
  role: 'user',
  content:
    'Return JSON with version (string), retention (integer days), comments ("Chinese" or null), according to the latest applicable requirements.',
};
function parse(text: string) {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  } catch {
    return null;
  }
}
for (let round = 0; round < runs; round++) {
  for (const c of cases) {
    const source: ModelMessage = { role: 'user', content: c.source };
    let history: ModelMessage[] = [
      source,
      {
        role: 'assistant',
        content: Array.from(
          { length: 400 },
          (_, i) =>
            'Exploration note ' + i + ': inspect implementation choices; no new requirements.',
        ).join('\n'),
      },
    ];
    for (let n = 0; n < 2; n++) {
      const summary = await ask([
        { role: 'system', content: COMPACT },
        { role: 'user', content: JSON.stringify(history) },
      ]);
      summaries.push({
        case: c.id,
        round,
        pass: n,
        usage: summary.usage,
        costUsd: summary.costUsd,
        latencyMs: summary.latencyMs,
      });
      history = [{ role: 'user', contextKind: 'history-handoff', content: summary.text }];
    }
    for (const enabled of round % 2 ? [true, false] : [false, true]) {
      const result = await ask([
        system,
        ...history,
        ...(enabled ? [sourceLedger([source])!] : []),
        query,
      ]);
      const answer = parse(result.text),
        passed = !!answer && Object.entries(c.expected).every(([k, v]) => answer[k] === v);
      records.push({ case: c.id, round, enabled, treatment: 'source-ledger', passed, ...result });
    }
  }
  const controls: {
    id: string;
    expected: string;
    scenario: string;
    observation: Observation;
    repeat: number;
  }[] = [
    {
      id: 'repeat',
      expected: 'change_strategy',
      scenario:
        'Four identical reads returned identical data and made no progress. Choose continue, wait, change_strategy, or verify.',
      observation: { calls: [['read_file', { path: 'a' }]], outputs: ['same'], tasks: [] },
      repeat: 4,
    },
    {
      id: 'wait',
      expected: 'wait',
      scenario:
        'A background download is running normally. An event-driven wait has not completed. Choose continue, wait, change_strategy, or verify.',
      observation: { calls: [['wait_background_command', {}]], outputs: ['waiting'], tasks: [] },
      repeat: 8,
    },
    {
      id: 'healthy',
      expected: 'continue',
      scenario:
        'The first independent investigation has just produced new data. Continue to the next planned step. Choose continue, wait, change_strategy, or verify.',
      observation: { calls: [['read_file', { path: 'b' }]], outputs: ['new'], tasks: [] },
      repeat: 1,
    },
    {
      id: 'verification',
      expected: 'verify',
      scenario:
        'Implementation is marked done. Required independent verification remains pending. Choose continue, wait, change_strategy, or verify.',
      observation: {
        calls: [],
        outputs: [],
        tasks: [
          { id: 'code', kind: 'implement', status: 'done' },
          { id: 'check', kind: 'verify', status: 'pending' },
        ],
      },
      repeat: 1,
    },
  ];
  for (const c of controls) {
    let state = initialCognitiveState(),
      decision;
    for (let n = 0; n < c.repeat; n++) {
      decision = cognitivePolicy(state, c.observation);
      state = decision.state;
    }
    for (const enabled of round % 2 ? [true, false] : [false, true]) {
      const result = await ask([
        system,
        { role: 'user', content: c.scenario },
        ...(enabled && decision?.message
          ? [{ role: 'user' as const, content: 'Runtime observation: ' + decision.message }]
          : []),
      ]);
      records.push({
        case: c.id,
        round,
        enabled,
        treatment: decision?.message ? 'advisory' : 'identical-prompt',
        formatPassed: result.text.trim() === c.expected,
        passed: actionAnswer(result.text) === c.expected,
        ...result,
      });
    }
  }
  console.log('Finished paired round ' + (round + 1) + '/' + runs);
}
const summary = [false, true].map((enabled) => {
  const rows = records.filter((r) => r.enabled === enabled);
  return {
    enabled,
    samples: rows.length,
    passed: rows.filter((r) => r.passed).length,
    inputTokens: rows.reduce((n, r) => n + r.usage.input, 0),
    cachedTokens: rows.reduce((n, r) => n + r.usage.cached, 0),
    meanLatencyMs: rows.reduce((n, r) => n + r.latencyMs, 0) / rows.length,
    totalCostUsd: rows.every((r) => r.costUsd !== null)
      ? rows.reduce((n, r) => n + r.costUsd, 0)
      : null,
  };
});
const byTreatment = ['source-ledger', 'advisory', 'identical-prompt'].flatMap((treatment) =>
  [false, true].map((enabled) => {
    const rows = records.filter((r) => r.treatment === treatment && r.enabled === enabled);
    return {
      treatment,
      enabled,
      samples: rows.length,
      passed: rows.filter((r) => r.passed).length,
    };
  }),
);
const report = {
  graderVersion: 2,
  byTreatment,
  gradingNote:
    'Semantic action and exact formatting are separate. Identical-prompt differences are sampling variation, not intervention effects.',
  schemaVersion: 1,
  kind: 'paired-context-control',
  model: profile.model,
  config: { tasks: 6, runs, variants: ['off', 'on'], summaryPasses: 2 },
  scope:
    'Synthetic retention and action-choice probes. No code execution or general autonomous success claim. Shared summary costs reported separately; request order alternates by round.',
  summary,
  summaries,
  records,
};
await mkdir('evals/results', { recursive: true });
await writeFile('evals/results/context-control.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary));
