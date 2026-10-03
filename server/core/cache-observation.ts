import { createHash } from 'node:crypto';
import type { ModelMessage, Profile, ToolSpec, Usage } from '../../shared/types.js';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface PrefixObservation {
  route: string;
  system: string;
  tools: string;
  messages: string[];
  truncated: boolean;
}
export function prefixObservation(
  messages: ModelMessage[],
  tools: ToolSpec[],
  profile: Profile,
): PrefixObservation {
  return {
    route: hash([profile.transport, profile.baseUrl, profile.model, profile.reasoning]),
    system: hash(messages.filter((m) => m.role === 'system').map((m) => m.content)),
    tools: hash(tools),
    messages: messages.slice(0, 256).map((m) =>
      hash({
        role: m.role,
        content: m.content,
        calls: m.calls,
        callId: m.callId,
        images: m.images,
        reasoning: m.reasoning,
        native: m.native,
      }),
    ),
    truncated: messages.length > 256,
  };
}
export function comparePrefix(
  previous: PrefixObservation | undefined,
  current: PrefixObservation,
  usage: Usage,
) {
  let unchangedMessages = 0;
  if (previous)
    while (
      unchangedMessages < Math.min(previous.messages.length, current.messages.length) &&
      previous.messages[unchangedMessages] === current.messages[unchangedMessages]
    )
      unchangedMessages++;
  return {
    baseline: !!previous,
    routeChanged: previous ? previous.route !== current.route : null,
    systemChanged: previous ? previous.system !== current.system : null,
    toolsChanged: previous ? previous.tools !== current.tools : null,
    unchangedMessages,
    prefixScanTruncated: current.truncated,
    measured: usage.measured,
    inputTokens: usage.measured ? usage.input : null,
    cachedTokens: usage.measured ? usage.cached : null,
    cacheRatio: usage.measured && usage.input > 0 ? usage.cached / usage.input : null,
  };
}
export function contextComponents(messages: ModelMessage[], tools: ToolSpec[]) {
  const chars = {
    instructions: 0,
    runtime: 0,
    toolResults: 0,
    conversation: 0,
    toolSchemas: JSON.stringify(tools).length,
  };
  for (const m of messages)
    chars[
      m.role === 'system'
        ? 'instructions'
        : m.contextKind
          ? 'runtime'
          : m.role === 'tool'
            ? 'toolResults'
            : 'conversation'
    ] += m.content.length;
  return {
    characters: chars,
    images: messages.reduce((n, m) => n + (m.images?.length || 0), 0),
    unit: 'characters, not tokens',
  };
}
