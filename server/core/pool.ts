import { configuredLimit } from './limits.js';
import { abortError } from './errors.js';
export class ModelPool {
  private groups = new Map<string, { active: number; queue: Array<() => void> }>();
  constructor(private capacity: () => number) {}
  async run<T>(signal: AbortSignal, fn: () => Promise<T>, scope = 'default'): Promise<T> {
    if (signal.aborted) throw abortError();
    let group = this.groups.get(scope);
    if (!group) this.groups.set(scope, (group = { active: 0, queue: [] }));
    const state = group;
    const clean = () => {
      if (!state.active && !state.queue.length) this.groups.delete(scope);
    };
    await new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal.removeEventListener('abort', abort);
        state.active++;
        resolve();
      };
      const abort = () => {
        state.queue = state.queue.filter((q) => q !== enter);
        clean();
        reject(abortError());
      };
      if (state.active < configuredLimit(this.capacity())) enter();
      else {
        state.queue.push(enter);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      if (signal.aborted) throw abortError();
      return await fn();
    } finally {
      state.active--;
      while (state.queue.length && state.active < configuredLimit(this.capacity()))
        state.queue.shift()!();
      clean();
    }
  }
}
