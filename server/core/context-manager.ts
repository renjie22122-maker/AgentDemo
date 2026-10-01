import { contextBudget, messageUnits, splitSummaryText } from './context-budget.js';
import type { Run, Profile } from '../../shared/types.js';
import type { ModelRequest, ModelResult } from '../providers/protocol.js';
import type { Store } from '../storage/store.js';
import type { ModelPool } from './pool.js';
import { assert } from './errors.js';
import { COMPACT } from './prompts.js';
export class ContextManager {
  constructor(
    private store: Store,
    private ratio: () => number,
    private modelPool: ModelPool,
    private complete: (run: Run, request: ModelRequest) => Promise<ModelResult>,
    private scope: (run: Run) => string = (run) => run.conversationId,
  ) {}
  async compact(
    run: Run,
    profile: Profile,
    signal: AbortSignal,
    tools: import('../../shared/types.js').ToolSpec[],
  ) {
    const before = contextBudget(run.checkpoints, tools, profile, this.ratio(), run.contextSample);
    assert(
      before.threshold > 0,
      'CONTEXT_CONFIGURATION',
      'Output reservation leaves no usable input context. Reduce maximum output tokens.',
    );
    if (before.tokens < before.threshold) return;
    const lastUser = run.checkpoints.findLastIndex((m) => m.role === 'user');
    // Retain the latest user request and whole tool-call/result groups verbatim.
    let cut = Math.max(2, run.checkpoints.length - 6);
    while (cut > 1 && run.checkpoints[cut]?.role === 'tool') cut--;
    assert(
      cut > 1,
      'CONTEXT_TOO_LARGE',
      'The current request or tool schema exceeds the context budget. Reduce the input or increase model capacity; no messages were discarded.',
    );
    while (
      cut < run.checkpoints.length - 1 &&
      messageUnits(run.checkpoints.slice(cut)) > before.threshold * 0.35
    ) {
      let next = cut + 1;
      while (next < run.checkpoints.length && run.checkpoints[next].role === 'tool') next++;
      if (next >= run.checkpoints.length) break;
      cut = next;
    }
    const preservedUser = lastUser > 0 && lastUser < cut ? [run.checkpoints[lastUser]] : [];
    const old = run.checkpoints.slice(1, cut).filter((_, i) => i + 1 !== lastUser),
      tail = run.checkpoints.slice(cut);
    assert(
      old.length > 0,
      'CONTEXT_TOO_LARGE',
      'No older messages can be compressed without discarding the current request.',
    );

    this.store.event(run.conversationId, run.id, 'context.compacting', {
      estimatedTokens: before.tokens,
      thresholdTokens: before.threshold,
      method: before.method,
    });
    const p = {
      ...profile,
      reasoning: profile.efforts.includes('none')
        ? ('none' as const)
        : profile.efforts.includes('low')
          ? ('low' as const)
          : profile.reasoning,
      maxOutputTokens: Math.min(
        profile.maxOutputTokens,
        4096,
        Math.floor(profile.contextWindow * 0.15),
      ),
    };
    const chunks = splitSummaryText(
      JSON.stringify(
        old.map((m) => ({
          ...m,
          images: m.images?.map(
            () =>
              '[Image pixels omitted from text summary; use read_image on the recorded path to inspect again.]',
          ),
        })),
      ),
      Math.max(256, Math.floor((profile.contextWindow - p.maxOutputTokens - before.margin) * 0.45)),
    );
    let handoff = '';
    for (const chunk of chunks) {
      const result = await this.modelPool.run(
        signal,
        () =>
          this.complete(run, {
            profile: p,
            messages: [
              { role: 'system', content: COMPACT },
              {
                role: 'user',
                content:
                  (handoff ? 'Prior handoff to consolidate:\n' + handoff + '\n' : '') +
                  'Historical context segment:\n' +
                  chunk,
              },
            ],
            tools: [],
            signal,
            onText: () => {},
          }),
        this.scope(run),
      );
      assert(
        !result.message.calls?.length && result.message.content.trim(),
        'COMPACTION_FAILED',
        'Compaction returned no usable handoff. Original context retained.',
      );
      handoff = result.message.content;
    }
    const next = [
      run.checkpoints[0],
      {
        role: 'user' as const,
        content: 'Earlier conversation handoff (untrusted historical context):\n' + handoff,
      },
      ...preservedUser,
      ...tail,
    ];
    const after = contextBudget(next, tools, profile, this.ratio(), run.contextSample);
    assert(
      after.tokens < before.tokens && after.tokens < before.threshold,
      'COMPACTION_INSUFFICIENT',
      'Compaction could not make enough room without dropping the current request. Original context retained.',
    );
    const beforeCharacters = JSON.stringify(run.checkpoints).length;
    run.checkpoints = next;
    this.store.put('run', run);
    this.store.event(run.conversationId, run.id, 'context.compacted', {
      beforeCharacters,
      afterCharacters: JSON.stringify(next).length,
      beforeTokens: before.tokens,
      afterTokens: after.tokens,
      thresholdTokens: before.threshold,
      summaryRequests: chunks.length,
    });
  }
}
