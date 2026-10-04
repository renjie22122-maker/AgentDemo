import { createHash } from 'node:crypto';
import type { ModelMessage, Profile, ToolSpec, ContextSample } from '../../shared/types.js';

export function textUnits(text: string) {
  let ascii = 0,
    other = 0;
  for (const char of text) {
    if (char.codePointAt(0)! < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + other);
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function messageUnits(messages: ModelMessage[]) {
  return messages.reduce(
    (n, m) =>
      n +
      8 +
      textUnits(
        JSON.stringify({
          role: m.role,
          content: m.content,
          calls: m.calls,
          callId: m.callId,
          reasoning: m.reasoning,
          native: m.native,
        }),
      ) +
      2048 * (m.images?.length || 0),
    0,
  );
}
export const profileKey = (p: Profile) =>
  JSON.stringify([p.transport, p.baseUrl, p.model, p.reasoningFormat, p.reasoning]);
export function sampleContext(
  messages: ModelMessage[],
  tools: ToolSpec[],
  profile: Profile,
  tokens: number,
): ContextSample {
  return {
    fingerprint: profileKey(profile),
    digest: digest(messages),
    toolsDigest: digest(tools),
    units: messageUnits(messages) + textUnits(JSON.stringify(tools)) + 16,
    tokens,
    messageCount: messages.length,
  };
}
export function contextBudget(
  messages: ModelMessage[],
  tools: ToolSpec[],
  profile: Profile,
  ratio: number,
  sample?: ContextSample,
) {
  const units = messageUnits(messages) + textUnits(JSON.stringify(tools)) + 16;
  const valid =
    sample &&
    sample.fingerprint === profileKey(profile) &&
    sample.units > 0 &&
    Number.isFinite(sample.tokens) &&
    sample.tokens > 0;
  let tokens = units,
    method = 'estimated';
  if (valid) {
    const scale = sample.tokens / sample.units;
    const sameTools = sample.toolsDigest === digest(tools);
    const samePrefix =
      messages.length >= sample.messageCount &&
      sample.digest === digest(messages.slice(0, sample.messageCount));
    if (sameTools && samePrefix) {
      tokens = sample.tokens + Math.max(0, units - sample.units) * Math.max(1, scale);
      method = units === sample.units ? 'measured' : 'calibrated';
    } else {
      tokens = units * Math.max(0.5, scale);
      method = 'calibrated';
    }
  }
  const reserve = profile.maxOutputTokens,
    margin = Math.max(256, Math.ceil(profile.contextWindow * 0.02));
  const limit = Math.max(0, profile.contextWindow - reserve - margin);
  const threshold = Math.max(0, Math.min(Math.floor(profile.contextWindow * ratio), limit));
  return {
    tokens: Math.ceil(tokens),
    method,
    threshold,
    reserve,
    margin,
    inputLimit: limit,
    capacity: profile.contextWindow,
  };
}
// Summarization inputs are plain text, not live tool messages. Split with a token estimate.
export function splitSummaryText(text: string, budget: number) {
  const chunks: string[] = [];
  while (text.length) {
    let low = 1,
      high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (textUnits(text.slice(0, mid)) <= budget) low = mid;
      else high = mid - 1;
    }
    chunks.push(text.slice(0, low));
    text = text.slice(low);
  }
  return chunks;
}
