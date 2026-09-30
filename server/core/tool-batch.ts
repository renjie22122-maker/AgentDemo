import type { ToolCall } from '../../shared/types.js';
import { abortError } from './errors.js';

// Only explicitly audited observational tools may overlap. A serial call is a barrier.
export async function executeBatch<T>(
  calls: ToolCall[],
  parallelSafe: (name: string) => boolean,
  invoke: (call: ToolCall) => Promise<T>,
  commit: (call: ToolCall, result: T) => void,
  signal: AbortSignal,
  concurrency = 4,
): Promise<T[]> {
  const results: T[] = [];
  const limit = Math.max(1, Math.min(16, Math.floor(concurrency) || 1));
  for (let at = 0; at < calls.length;) {
    if (signal.aborted) throw abortError();
    let end = at + 1;
    if (parallelSafe(calls[at].name))
      while (end < calls.length && end - at < limit && parallelSafe(calls[end].name)) end++;
    // Settle every started operation before unwinding. No late work after terminal state.
    const settled = await Promise.allSettled(calls.slice(at, end).map(invoke));
    for (let i = 0; i < settled.length; i++) {
      const item = settled[i];
      if (item.status === 'fulfilled') {
        results.push(item.value);
        commit(calls[at + i], item.value);
      }
    }
    const failure = settled.find((r) => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    at = end;
  }
  return results;
}
