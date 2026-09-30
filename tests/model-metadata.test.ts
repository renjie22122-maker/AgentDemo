import test from 'node:test';
import assert from 'node:assert/strict';
import { matchModel } from '../shared/model-metadata.js';
import { profileSchema } from '../server/services/settings.js';
import { discoverModels } from '../server/providers/registry.js';
const p = profileSchema.parse({
  id: 'x',
  name: 'x',
  transport: 'openai-chat',
  baseUrl: 'https://api.deepseek.com',
  model: 'x',
  reasoning: 'medium',
});
test('discovery matches capacity, output ceiling, vision and supported reasoning', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'flash',
              context_window: 1048576,
              max_output_tokens: 393216,
              input_modalities: ['text', 'image'],
              effort: { supported_levels: ['low', 'high', 'max'] },
            },
          ],
        }),
      ),
  );
  const [m] = await discoverModels(p),
    result = matchModel(p, m);
  assert.equal(result.contextWindow, 1048576);
  assert.equal(result.maxOutputTokens, 131072);
  assert.equal(result.vision, true);
  assert.equal(result.reasoning, 'auto');
  assert.deepEqual(result.efforts, ['auto', 'none', 'low', 'high', 'max']);
  assert.equal(result.reasoningFormat, 'deepseek');
});
test('missing metadata keeps manual capabilities; model ceiling clamps output', () => {
  const missing = matchModel(p, { id: 'unknown' });
  assert.equal(missing.contextWindow, p.contextWindow);
  assert.equal(missing.maxOutputTokens, p.maxOutputTokens);
  assert.equal(
    matchModel(p, { id: 'small', contextWindow: 16384, maxOutputTokens: 2048 }).maxOutputTokens,
    2048,
  );
});
