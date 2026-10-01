import type { PendingInput, Run } from '../../shared/types.js';
import { abortError, assert } from '../core/errors.js';
import { Store, id } from '../storage/store.js';
export class Inputs {
  private waiting = new Map<
    string,
    { resolve: (value: string) => void; reject: (e: Error) => void }
  >();
  constructor(
    private store: Store,
    private review?: (run: Run, payload: Record<string, any>, signal: AbortSignal) => Promise<any>,
  ) {}
  async request(
    run: Run,
    kind: PendingInput['kind'],
    payload: Record<string, any>,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) throw abortError();
    const item: PendingInput = {
      id: id(),
      runId: run.id,
      conversationId: run.conversationId,
      kind,
      payload,
      status: 'pending',
      answer: null,
      createdAt: Date.now(),
    };
    if (kind === 'approval' && this.review) {
      const review = await this.review(run, payload, signal);
      if (review) {
        item.payload = { ...payload, autoReview: review };
        if (review.decision === 'allow') {
          item.status = 'answered';
          item.answer = 'Approved by automatic reviewer: ' + review.reason;
          this.store.put('input', item);
          this.store.event(run.conversationId, run.id, 'input.requested', { ...item });
          this.store.event(run.conversationId, run.id, 'input.answered', {
            id: item.id,
            answer: item.answer,
            allow: true,
            automatic: true,
          });
          return item.answer;
        }
      }
    }
    signal.throwIfAborted();
    this.store.put('input', item);
    this.store.transition(run.id, kind === 'approval' ? 'waiting_approval' : 'waiting_user');
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.waiting.delete(item.id);
        this.store.put('input', { ...item, status: 'cancelled' });
        reject(abortError());
      };
      this.waiting.set(item.id, {
        resolve: (value) => {
          signal.removeEventListener('abort', abort);
          this.waiting.delete(item.id);
          if (!signal.aborted) this.store.transition(run.id, 'running');
          resolve(value);
        },
        reject: (e) => {
          signal.removeEventListener('abort', abort);
          this.waiting.delete(item.id);
          reject(e);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
      this.store.event(run.conversationId, run.id, 'input.requested', { ...item });
    });
  }
  answer(key: string, answer: string, allow: boolean) {
    const q = this.store.get<PendingInput>('input', key),
      waiter = this.waiting.get(key);
    assert(
      q.status === 'pending' && waiter,
      'STALE_INPUT',
      'This request is no longer waiting.',
      409,
    );
    this.store.put('input', { ...q, status: allow ? 'answered' : 'denied', answer });
    this.store.event(q.conversationId, q.runId, 'input.answered', { id: key, answer, allow });
    // A denial is a tool result, not an entire task failure.
    waiter.resolve(allow ? answer : 'DENIED BY USER: ' + answer);
  }
}
