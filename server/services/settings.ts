import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { Profile, Settings } from '../../shared/types.js';
import { assert } from '../core/errors.js';
const reasoning = z.enum(['auto', 'none', 'low', 'medium', 'high', 'max']);
const price = z.number().nonnegative().nullable();
export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  transport: z.enum(['openai-chat', 'anthropic', 'openai-responses', 'gemini']),
  baseUrl: z.url(),
  apiKey: z.string().default(''),
  model: z.string().min(1),
  reasoning: reasoning.default('auto'),
  reasoningFormat: z.enum(['none', 'openai', 'deepseek', 'anthropic', 'gemini']).default('none'),
  efforts: z.array(reasoning).default(['auto']),
  contextWindow: z.number().int().min(4096).max(10_000_000).default(65536),
  maxOutputTokens: z.number().int().min(256).max(1_000_000).default(8192),
  timeoutMs: z.number().int().min(1000).max(1800000).default(120000),
  vision: z.boolean().default(false),
  prices: z
    .object({ input: price, output: price, cached: price })
    .default({ input: null, output: null, cached: null }),
});
const schema = z.object({
  web: z
    .object({
      enabled: z.boolean().default(true),
      searchProfileId: z.string().default(''),
      searchBaseUrl: z.url().default('https://api.deepseek.com/anthropic/v1'),
      searchModel: z.string().default(''),
      timeoutMs: z.number().int().min(1000).max(120000).default(60000),
    })
    .default({
      enabled: true,
      searchProfileId: '',
      searchBaseUrl: 'https://api.deepseek.com/anthropic/v1',
      searchModel: '',
      timeoutMs: 60000,
    }),

  profiles: z.array(profileSchema),
  defaultProfileId: z.string(),
  maxParallelRuns: z.number().int().min(1).max(12).default(3),
  maxAgentDepth: z.number().int().min(0).max(5).default(2),
  maxChildren: z.number().int().min(1).max(32).default(8),
  compactionRatio: z.number().min(0.3).max(0.9).default(0.75),
  dockerImage: z.string().default('node:24-bookworm-slim'),
  commandBackend: z.enum(['approval-host', 'docker', 'native-windows']).default('approval-host'),
  nativePython: z.string().default(''),
  nativeNetwork: z.enum(['deny', 'host']).default('deny'),
  embedding: z
    .object({ baseUrl: z.string(), apiKey: z.string(), model: z.string() })
    .default({ baseUrl: '', apiKey: '', model: '' }),
  mcp: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()),
        enabled: z.boolean(),
      }),
    )
    .default([]),
});
export class Configuration {
  private value: Settings;
  constructor(private path: string) {
    this.value = existsSync(path)
      ? schema.parse(JSON.parse(readFileSync(path, 'utf8')))
      : schema.parse({ profiles: [], defaultProfileId: '' });
  }
  get(): Settings {
    return structuredClone(this.value);
  }
  profile(key?: string): Profile {
    const p = this.value.profiles.find((p) => p.id === (key || this.value.defaultProfileId));
    assert(
      p,
      'MODEL_NOT_CONFIGURED',
      'Add a model connection in Settings before starting a task.',
      409,
    );
    return structuredClone(p);
  }
  public() {
    return {
      ...this.get(),
      profiles: this.value.profiles.map(({ apiKey, ...rest }) => ({ ...rest, hasKey: !!apiKey })),
      embedding: {
        ...this.value.embedding,
        apiKey: undefined,
        hasKey: !!this.value.embedding.apiKey,
      },
    };
  }
  save(input: unknown) {
    const raw = input as any;
    for (const p of raw.profiles || [])
      if (p.apiKey === undefined)
        p.apiKey = this.value.profiles.find((x) => x.id === p.id)?.apiKey || '';
    if (raw.embedding && raw.embedding.apiKey === undefined)
      raw.embedding.apiKey = this.value.embedding.apiKey;
    const next = schema.parse(raw);
    assert(
      next.commandBackend !== 'native-windows' ||
        (isAbsolute(next.nativePython || '') && existsSync(next.nativePython!)),
      'NATIVE_CONFIGURATION',
      'AppContainer requires an existing absolute Python interpreter path. Configure Native Python interpreter before saving.',
    );

    assert(
      new Set(next.profiles.map((p) => p.id)).size === next.profiles.length,
      'DUPLICATE_PROFILE',
      'Connection IDs must be unique.',
    );
    for (const p of next.profiles) {
      const u = new URL(p.baseUrl);
      assert(
        !u.username && !u.password && !u.search && !u.hash,
        'INVALID_ENDPOINT',
        'Model endpoint must not contain credentials, query or fragment.',
      );
      assert(
        u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)),
        'INVALID_ENDPOINT',
        'Use HTTPS, or a local HTTP model endpoint.',
      );
      assert(
        p.efforts.includes(p.reasoning),
        'UNSUPPORTED_REASONING',
        'Default reasoning must be in the supported effort list.',
      );
    }
    assert(
      !next.profiles.length || next.profiles.some((p) => p.id === next.defaultProfileId),
      'DEFAULT_MODEL',
      'Select an existing default connection.',
    );
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
    this.value = next;
    return this.public();
  }
}
