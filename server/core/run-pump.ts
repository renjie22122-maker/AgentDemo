import { configuredLimit } from './limits.js';
export interface PumpPorts {
  scope(key: string): string;
  status(key: string): string;
  limit(): number;
  execute(key: string, signal: AbortSignal): Promise<void>;
  finished(key: string): void;
}
export class RunPump {
  private queue: string[] = [];
  private controllers = new Map<string, AbortController>();
  private tasks = new Map<string, Promise<void>>();
  private closed = false;
  constructor(private ports: PumpPorts) {}
  enqueue(key: string) {
    if (this.closed) throw Error('Runtime is shutting down');
    if (!this.queue.includes(key) && !this.controllers.has(key)) this.queue.push(key);
  }
  signal(key: string) {
    return this.controllers.get(key)?.signal;
  }
  keys() {
    return [...new Set([...this.controllers.keys(), ...this.queue])];
  }
  cancel(key: string) {
    const c = this.controllers.get(key);
    if (c) {
      c.abort();
      return true;
    }
    this.queue = this.queue.filter((k) => k !== key);
    return false;
  }
  stopAccepting() {
    this.closed = true;
  }
  async drained() {
    await Promise.allSettled([...this.tasks.values()]);
  }
  pump() {
    if (this.closed) return;
    const counts = new Map<string, number>();
    for (const key of this.controllers.keys()) {
      if (['waiting_children', 'waiting_approval', 'waiting_user'].includes(this.ports.status(key)))
        continue;
      const scope = this.ports.scope(key);
      counts.set(scope, (counts.get(scope) || 0) + 1);
    }
    for (let i = 0; i < this.queue.length;) {
      const key = this.queue[i],
        scope = this.ports.scope(key);
      if ((counts.get(scope) || 0) >= configuredLimit(this.ports.limit())) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      counts.set(scope, (counts.get(scope) || 0) + 1);
      const controller = new AbortController();
      this.controllers.set(key, controller);
      const task = Promise.resolve()
        .then(() => this.ports.execute(key, controller.signal))
        .finally(() => {
          this.controllers.delete(key);
          this.tasks.delete(key);
          try {
            this.ports.finished(key);
          } finally {
            this.pump();
          }
        });
      // Runtime owns failure reporting; retain a rejection handler even when no caller drains.
      task.catch(() => {});
      this.tasks.set(key, task);
    }
  }
}
