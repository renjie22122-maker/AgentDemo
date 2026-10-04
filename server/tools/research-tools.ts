import { z } from 'zod';
import { id } from '../storage/store.js';
import { assert } from '../core/errors.js';
import { readWebEvidence } from '../services/web-evidence.js';
import type { ToolRegistry } from './registry.js';
export function installResearch(registry: ToolRegistry) {
  registry.add({
    name: 'research_sources',
    effect: 'network',
    description:
      'Fetch up to six public sources with individual evidence IDs, progress and failures. This collects evidence, not a truth verdict. Every fetch retains network policy and audit.',
    schema: z.object({ urls: z.array(z.url()).min(1).max(6) }),
    run: async (a, c) => {
      assert(c.invokeTool, 'RESEARCH_CONTEXT', 'Audited runtime required.');
      const results = [];
      let index = 0;
      for (const url of [...new Set(a.urls)] as string[]) {
        c.signal.throwIfAborted();
        results.push({ url, ...(await c.invokeTool('fetch_url', { url }, index++)) });
        c.store.event(c.run.conversationId, c.run.id, 'tool.progress', {
          callId: c.callId,
          completed: index,
          total: a.urls.length,
        });
      }
      return {
        content: JSON.stringify({ results, semanticVerdict: 'not_assessed' }),
        outcome: {
          status: results.every((x) => x.outcome?.status === 'succeeded') ? 'succeeded' : 'failed',
          code: 'RESEARCH_COLLECTED',
        },
      };
    },
  });
  registry.add({
    name: 'crosscheck_sources',
    effect: 'read',
    description:
      'Build a scoped research report. Verify exact quotes against saved sources, expose supporting/contradicting claims, duplicate content and distinct hosts. Stances are model assessments, not host-proven truth.',
    schema: z.object({
      claim: z.string().min(1).max(4000),
      references: z
        .array(
          z.object({
            evidenceId: z.string(),
            quote: z.string().min(1).max(2000),
            stance: z.enum(['supports', 'contradicts', 'unclear']),
          }),
        )
        .min(1)
        .max(12),
    }),
    run: (a, c) => {
      const citations = a.references.map((ref: any) => {
        const source = c.store.get<any>('web-evidence', ref.evidenceId);
        readWebEvidence(c.store, c.run, ref.evidenceId, 0, 1);
        return {
          ...ref,
          url: source.url,
          host: new URL(source.url).hostname,
          sourceHash: source.sourceHash,
          retrievedAt: source.retrievedAt,
          quoteFound: source.text.includes(ref.quote),
          sourceTruncated: source.truncated,
          successfulFetch: source.status >= 200 && source.status < 300,
        };
      });
      const valid = citations.filter((x: any) => x.quoteFound && x.successfulFetch);
      const report = {
        id: id(),
        conversationId: c.run.conversationId,
        runId: c.run.id,
        claim: a.claim,
        citations,
        distinctHosts: new Set(valid.map((x: any) => x.host)).size,
        distinctContents: new Set(valid.map((x: any) => x.sourceHash)).size,
        conflict:
          valid.some((x: any) => x.stance === 'supports') &&
          valid.some((x: any) => x.stance === 'contradicts'),
        semanticVerdict: 'requires_judgment',
        publisherIndependence: 'not_verified',
        createdAt: Date.now(),
      };
      c.store.put('research-report', report);
      return { content: JSON.stringify(report) };
    },
  });
}
