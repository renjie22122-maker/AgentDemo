import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Configuration } from '../../server/services/settings.js';
import { Store } from '../../server/storage/store.js';
import { Runtime } from '../../server/core/runtime.js';
import { terminal } from '../../server/core/lifecycle.js';
import { providerFor } from '../../server/providers/registry.js';
import { usageCost } from '../../server/core/context-economics.js';
import type { ModelProvider } from '../../server/providers/protocol.js';
import type { Run, Usage } from '../../shared/types.js';
import { withoutReadReuse } from './adapter.js';
// The worker deliberately never imports the grader, checks, reference solutions or task catalog.
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const base = new Configuration(job.settings).profile(job.profileId);
const profile = { ...base, maxOutputTokens: 4096, timeoutMs: 120000 };
const dir = resolve(job.directory);
await mkdir(dir, { recursive: true });
const config = new Configuration(join(dir, 'config.json'), { persistSecrets: false });
config.save({
  ...config.get(),
  profiles: [profile],
  defaultProfileId: profile.id,
  maxAgentDepth: 0,
  maxChildren: 1,
  maxParallelRuns: 1,
  approveFileWrites: false,
});
const store = new Store(join(dir, 'runtime.sqlite'));
const allowed = new Set(['read_file', 'write_file', 'edit_file', 'list_files']);
const requests: { usage: Usage; elapsedMs: number }[] = [];
let failedCalls = 0,
  restoredMessages = 0;
const wrapper: ModelProvider = {
  complete: async (req) => {
    const at = Date.now();
    try {
      let messages = req.messages;
      if (job.arm === 'read-reuse-off') {
        const outputs = new Map<string, string>(
          store
            .events('chat')
            .filter((e) => e.type === 'tool.completed')
            .map((e) => [e.data.callId, e.data.output]),
        );
        const transformed = withoutReadReuse(messages, outputs);
        messages = transformed.messages;
        restoredMessages += transformed.restored;
      }
      const result = await providerFor(profile).complete({
        ...req,
        messages,
        tools: req.tools.filter((t) => allowed.has(t.name)),
      });
      requests.push({ usage: result.usage, elapsedMs: Date.now() - at });
      if (result.message.calls?.some((c) => !allowed.has(c.name)))
        throw Error('EVAL_TOOL_NOT_ALLOWED');
      return result;
    } catch (error) {
      failedCalls++;
      throw error;
    }
  },
};
const runtime = new Runtime(store, config, dir, () => wrapper);
const originalSpecs = runtime.registry.specs.bind(runtime.registry);
runtime.registry.specs = (ctx) => originalSpecs(ctx).filter((t) => allowed.has(t.name));
const now = Date.now();
store.put('conversation', {
  id: 'chat',
  title: job.id,
  projectId: null,
  profileId: profile.id,
  reasoning: profile.reasoning,
  permission: 'ask',
  createdAt: now,
  updatedAt: now,
  pinned: false,
  archived: false,
  parentId: null,
  forkEvent: null,
  skillIds: [],
  knowledge: false,
  memory: false,
  generateMemory: false,
  automaticMemory: false,
  teamStrategy: 'off',
});
let timedOut = false;
const run = runtime.start('chat', job.prompt, job.steps);
const timer = setTimeout(() => {
  timedOut = true;
  runtime.stop(run.id);
}, job.seconds * 1000);
try {
  while (!terminal(store.get<Run>('run', run.id).status))
    await new Promise((r) => setTimeout(r, 100));
  await runtime.shutdown();
  const runs = store.runs(),
    events = store.events('chat'),
    final = store.get<Run>('run', run.id);
  const usageComplete = failedCalls === 0 && requests.every((r) => r.usage.measured);
  const input = requests.reduce((n, r) => n + r.usage.input, 0),
    output = requests.reduce((n, r) => n + r.usage.output, 0),
    cached = requests.reduce((n, r) => n + r.usage.cached, 0);
  const costs = requests.map((r) => usageCost(r.usage, profile.prices));
  const count = (name: string) => events.filter((e) => e.type === name).length;
  let source: string | null = null;
  try {
    source = await readFile(join(dir, 'chats/chat/files/solution.cjs'), 'utf8');
  } catch {}
  await writeFile(
    join(dir, 'result.json'),
    JSON.stringify(
      {
        status: timedOut ? 'timeout' : final.status,
        termination: final.termination || null,
        source,
        metrics: {
          elapsedMs: Date.now() - now,
          inputTokens: input,
          outputTokens: output,
          cachedInputTokens: cached,
          totalTokens: input + output,
          usageComplete,
          estimatedUsd:
            usageComplete && costs.every((c) => c !== null)
              ? costs.reduce<number>((a, b) => a + b!, 0)
              : null,
          cacheHitRate: usageComplete && input > 0 ? cached / input : null,
          modelCalls: requests.length + failedCalls,
          failedModelCalls: failedCalls,
          httpRetries: null,
          toolCalls: count('tool.started'),
          protocolRepairs: count('model.protocol-repair'),
          compactions: count('context.compacted'),
          restoredMessages,
          reuseEvents: count('context.result_reused'),
          recoveryCount: count('recovery.inspected'),
          repetitionStops: runs.filter((r) => r.termination?.category === 'stagnation').length,
          humanInterventions: 0,
          runs: runs.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(timer);
  store.close();
}
