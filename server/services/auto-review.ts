import type { FileScope } from './paths.js';
import { inspectReviewSources, reviewEvidence } from './review-evidence.js';
import { approvalRisk } from '../../shared/approval-risk.js';
import { executionSettings } from '../../shared/execution.js';
import { ModelPool } from '../core/pool.js';
import { createHash } from 'node:crypto';
import {
  boundedReview,
  decideAssessment,
  REVIEW_POLICY_VERSION,
  REVIEW_PROMPT,
} from './review-policy.js';
import type { Conversation, Run } from '../../shared/types.js';
import type { ModelProvider } from '../providers/protocol.js';
import type { Configuration } from './settings.js';
import { Store, id } from '../storage/store.js';
export class AutoReview {
  private pool = new ModelPool(() => 1);
  constructor(
    private store: Store,
    private config: Configuration,
    private provider: (p: any) => ModelProvider,
    private filesForRun?: (run: Run) => Promise<FileScope>,
  ) {}
  async review(run: Run, payload: Record<string, any>, signal: AbortSignal) {
    const c = this.store.get<Conversation>('conversation', run.conversationId);
    if (c.permission !== 'auto') return null;
    const settings = executionSettings(this.config.get(), c);
    const humanDecisions = () =>
      this.store
        .list<any>('input')
        .filter(
          (q) =>
            q.conversationId === run.conversationId &&
            q.kind === 'approval' &&
            ['answered', 'denied'].includes(q.status) &&
            q.payload?.autoReview?.decision !== 'allow',
        )
        .slice(-12)
        .map((q) => ({
          id: q.id,
          status: q.status,
          answer: q.answer,
          request: Object.fromEntries(
            Object.entries(q.payload || {}).filter(
              ([key]) => !['autoReview', 'risk'].includes(key),
            ),
          ),
          scope: 'one-time decision only; never a reusable grant',
        }));
    const contextStamp = () =>
      createHash('sha256')
        .update(
          JSON.stringify({
            conversation: this.store.get<Conversation>('conversation', run.conversationId),
            settings: this.config.get(),
            humanDecisions: humanDecisions(),
            messages: this.store
              .events(run.conversationId)
              .filter((e) => e.type === 'user.message'),
          }),
        )
        .digest('hex');
    const initialStamp = contextStamp();
    const actionSnapshot = JSON.stringify(payload);
    const record: any = {
      id: id(),
      policyVersion: REVIEW_POLICY_VERSION,
      status: 'reviewing',
      runId: run.id,
      conversationId: run.conversationId,
      at: Date.now(),
      fingerprint: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      decision: 'ask',
      reason: 'Automatic review unavailable.',
    };
    this.store.event(run.conversationId, run.id, 'approval.reviewing', {
      id: record.id,
      policyVersion: REVIEW_POLICY_VERSION,
    });
    try {
      const original = this.config.profile(settings.autoReview?.profileId || run.profileId);
      const files =
        original.id === run.profileId && this.filesForRun ? await this.filesForRun(run) : undefined;
      const inspectedSource = files ? await inspectReviewSources(files, payload) : [];
      record.sourceEvidence = inspectedSource.map(({ content, ...metadata }: any) => metadata);
      const profile = {
        ...original,
        reasoning: 'auto' as const,
        maxOutputTokens: Math.min(original.maxOutputTokens, 4096),
        timeoutMs: settings.autoReview?.timeoutMs || 30000,
      };
      const reviewSignal = AbortSignal.any([signal, AbortSignal.timeout(profile.timeoutMs)]);
      const allMessages = this.store
        .events(run.conversationId)
        .filter((e) => e.type === 'user.message')
        .map((e, index) => ({
          id: index,
          text: String(e.data.content || e.data.text || '').slice(0, 5000),
        }));
      const messages =
        allMessages.length > 8
          ? [...allMessages.slice(0, 2), ...allMessages.slice(-6)]
          : allMessages;
      const risk = approvalRisk(payload);
      record.risk = risk;
      if (
        risk.automatic &&
        typeof payload.cwd === 'string' &&
        ['approval-host', 'native-windows', 'docker'].includes(payload.backend)
      ) {
        record.decision = 'allow';
        record.reason = 'Bounded built-in environment query; no arguments or shell composition.';
      } else if (risk.level === 'high')
        record.reason = 'High-risk operation requires explicit human approval: ' + risk.reason;
      else {
        const result = await this.pool.run(
          reviewSignal,
          () =>
            boundedReview(
              this.provider(profile).complete({
                profile,
                tools: [],
                signal: reviewSignal,
                onText: () => {},
                messages: [
                  {
                    role: 'system',
                    content: REVIEW_PROMPT,
                  },
                  {
                    role: 'user',
                    content: JSON.stringify({
                      humanMessages: messages,
                      humanDecisions: humanDecisions(),
                      request: payload,
                      sandbox: settings.commandBackend,
                      network: settings.nativeNetwork,
                      risk,
                      observedSource: reviewEvidence(run, original.id === run.profileId),
                      inspectedSource,
                    }),
                  },
                ],
              }),
              reviewSignal,
            ),
          run.conversationId,
        );
        record.usage = result.usage;
        record.model = profile.model;
        const prices = profile.prices,
          u = result.usage;
        record.estimatedUsd =
          u.measured && prices.input !== null && prices.output !== null && prices.cached !== null
            ? (Math.max(0, u.input - u.cached) * prices.input +
                u.cached * prices.cached +
                u.output * prices.output) /
              1e6
            : null;
        if (result.message.calls?.length) throw Error('Reviewer may not call tools.');
        const parsed = decideAssessment(
          JSON.parse(result.message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')),
          messages.map((message) => message.id),
        );
        Object.assign(record, parsed);
        if (
          files &&
          JSON.stringify(await inspectReviewSources(files, payload)) !==
            JSON.stringify(inspectedSource)
        ) {
          record.decision = 'ask';
          record.reason = 'Reviewed source changed during assessment; request a fresh review.';
        }
      }
    } catch {
      record.reason = 'Automatic review failed or timed out; manual approval is required.';
    }
    if (this.store.get<Conversation>('conversation', run.conversationId).permission !== 'auto') {
      record.decision = 'ask';
      record.reason = 'Permission mode changed while reviewing.';
    }
    if (contextStamp() !== initialStamp || JSON.stringify(payload) !== actionSnapshot) {
      record.decision = 'ask';
      record.reason =
        'Authorization context or action changed during review; review again with current evidence.';
    }
    record.status = signal.aborted
      ? 'aborted'
      : record.decision === 'allow'
        ? 'approved'
        : 'needs_human';
    record.durationMs = Date.now() - record.at;
    if (signal.aborted) {
      this.store.put('approval-review', record);
      this.store.event(run.conversationId, run.id, 'approval.reviewed', record);
    }
    signal.throwIfAborted();
    this.store.put('approval-review', record);
    this.store.event(run.conversationId, run.id, 'approval.reviewed', record);
    return record;
  }
}
