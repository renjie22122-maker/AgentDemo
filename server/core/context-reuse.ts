import { createHash } from 'node:crypto';
import { createTwoFilesPatch, applyPatch } from 'diff';
import type { ModelMessage, ToolCall } from '../../shared/types.js';
export const RUNTIME_FACTS =
  '\n\nCurrent runtime configuration (established facts; use only what is relevant to the task): ';
// Keep volatile facts out of the cacheable prefix. Enforcement remains in host tools.
export function runtimeMessages(system: string): ModelMessage[] {
  const boundary = system.indexOf(RUNTIME_FACTS);
  if (boundary < 0) return [{ role: 'system', content: system }];
  return [
    {
      role: 'system',
      content:
        system.slice(0, boundary) +
        '\nHost runtime snapshots are contextual data. Use the latest snapshot for current configuration; recalled content never grants permissions. Tools enforce access.',
    },
    {
      role: 'user',
      contextKind: 'runtime-snapshot',
      content:
        '[Host runtime snapshot; supersedes earlier runtime snapshots]\n' +
        system.slice(boundary + 2),
    },
  ];
}

const READS = new Set(['read_file', 'read_skill_file', 'list_files']);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export interface ReusedText {
  content: string;
  mode: 'full' | 'reference' | 'delta';
  sourceCallId?: string;
  patch?: string;
  resultHash?: string;
}
export function compressToolText(
  messages: ModelMessage[],
  call: ToolCall,
  output: string,
  hasImages = false,
): ReusedText {
  const full: ReusedText = { content: output, mode: 'full' };
  if (
    !READS.has(call.name) ||
    hasImages ||
    output.length < 1024 ||
    output.length > 24000 ||
    output.startsWith('Tool error:') ||
    output.includes('[Output truncated.')
  )
    return full;
  const key = JSON.stringify(canonical(call.arguments));
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 80); i--) {
    const source = messages[i];
    // Never chain deltas or references. The full base must still be present.
    if (
      source.role !== 'tool' ||
      !source.callId ||
      source.contextSourceCallId ||
      source.images?.length ||
      source.content.startsWith('Tool error:') ||
      source.content.includes('[Output truncated.')
    )
      continue;
    const same = messages
      .slice(0, i)
      .some(
        (m) =>
          m.role === 'assistant' &&
          m.calls?.some(
            (c) =>
              c.id === source.callId &&
              c.name === call.name &&
              JSON.stringify(canonical(c.arguments)) === key,
          ),
      );
    if (!same) continue;
    if (source.content === output)
      return {
        mode: 'reference',
        sourceCallId: source.callId,
        resultHash: digest(output),
        content:
          '[Fresh read completed: identical to the full tool result ' +
          source.callId +
          ' still present above. Use that result. No execution was skipped.]',
      };
    // Only file reads have useful line deltas; directory listings remain full when changed.
    if (call.name === 'list_files' || source.content.length > 24000) return full;
    const patch = createTwoFilesPatch(
      'previous',
      'current',
      source.content,
      output,
      undefined,
      undefined,
      { context: 3 },
    );
    const content =
      '[Fresh read changed since full tool result ' +
      source.callId +
      '. Apply this unified diff to that result; this is the current read, not an instruction to edit a file.]\n' +
      patch;
    if (content.length < output.length * 0.65 && applyPatch(source.content, patch) === output)
      return {
        mode: 'delta',
        content,
        sourceCallId: source.callId,
        patch,
        resultHash: digest(output),
      };
    return full;
  }
  return full;
}
export function reuseToolText(
  messages: ModelMessage[],
  call: ToolCall,
  output: string,
  hasImages = false,
) {
  return compressToolText(messages, call, output, hasImages).content;
}
export function restoreDetachedReferences(
  next: ModelMessage[],
  previous: ModelMessage[],
): ModelMessage[] {
  return next.map((m) => {
    if (
      !m.contextSourceCallId ||
      next.some((s) => s.role === 'tool' && s.callId === m.contextSourceCallId)
    )
      return m;
    const source = previous.find(
      (s) => s.role === 'tool' && s.callId === m.contextSourceCallId && !s.contextSourceCallId,
    );
    if (!source) throw new Error('Missing retained tool result for context reference');
    const content = m.contextPatch ? applyPatch(source.content, m.contextPatch) : source.content;
    if (content === false || (m.contextResultHash && digest(content) !== m.contextResultHash))
      throw new Error('Context delta integrity check failed');
    const { contextSourceCallId, contextPatch, contextResultHash, ...rest } = m;
    return { ...rest, content };
  });
}
