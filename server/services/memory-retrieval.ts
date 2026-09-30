import type { Memory } from '../../shared/types.js';
export function terms(text: string) {
  const words = text.toLowerCase().match(/[a-z0-9_]+|[\u3400-\u9fff]+/g) || [];
  return new Set(
    words.flatMap((word) =>
      /[\u3400-\u9fff]/.test(word)
        ? word.length < 2
          ? [word]
          : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))
        : [word],
    ),
  );
}
export function recallMemories(
  memories: Memory[],
  query: string,
  projectId: string | null,
  now = Date.now(),
  semantic = new Map<string, number>(),
) {
  const queryTerms = terms(query);
  const eligible = memories.filter(
    (m) =>
      m.active &&
      (!m.expiresAt || m.expiresAt > now) &&
      (m.scope === 'user' || (!!projectId && m.scope === 'project:' + projectId)),
  );
  const frequency = new Map<string, number>();
  for (const m of eligible)
    for (const term of terms(m.content)) frequency.set(term, (frequency.get(term) || 0) + 1);
  const ranked = eligible
    .map((m) => {
      const tokens = terms(m.content);
      let relevance = 3 * (semantic.get(m.id) || 0);
      for (const term of queryTerms)
        if (tokens.has(term))
          relevance += Math.log(1 + eligible.length / (frequency.get(term) || 1));
      return {
        ...m,
        relevance,
        score:
          relevance / Math.sqrt(Math.max(1, tokens.size)) +
          (m.scope.startsWith('project:') ? 0.08 : 0) +
          0.03 / (1 + Math.max(0, now - m.createdAt) / 86400000),
      };
    })
    .filter((m) => m.relevance > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const seen = new Set<string>(),
    selected = [];
  let size = 0;
  for (const m of ranked) {
    const key = m.content.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key) || size + m.content.length > 8000) continue;
    seen.add(key);
    size += m.content.length;
    selected.push({
      id: m.id,
      content: m.content,
      source: m.source,
      scope: m.scope,
      revision: m.revision,
    });
    if (selected.length === 12) break;
  }
  return selected;
}
