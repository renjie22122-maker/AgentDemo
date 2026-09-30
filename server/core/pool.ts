import { abortError } from './errors.js';
export class ModelPool {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private capacity: () => number) {}
  async run<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw abortError();
    await new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal.removeEventListener('abort', abort);
        this.active++;
        resolve();
      };
      const abort = () => {
        this.queue = this.queue.filter((q) => q !== enter);
        reject(abortError());
      };
      if (this.active < this.capacity()) enter();
      else {
        this.queue.push(enter);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      if (signal.aborted) throw abortError();
      return await fn();
    } finally {
      this.active--;
      while (this.queue.length && this.active < this.capacity()) this.queue.shift()!();
    }
  }
}
