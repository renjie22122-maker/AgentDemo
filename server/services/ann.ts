import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { AppError } from '../core/errors.js';
export class AnnIndex {
  constructor(private cacheDirectory?: string) {}
  private worker?: Worker;
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private generation = '';
  private chain: Promise<unknown> = Promise.resolve();
  search(
    key: string,
    rows: { id: string; values: number[] }[],
    query: number[],
    k = 30,
    signal?: AbortSignal,
  ): Promise<any> {
    if (!rows.length)
      return signal?.aborted
        ? Promise.reject(new AppError('CANCELLED', 'Cancelled'))
        : Promise.resolve({
            result: [],
            backend: 'empty',
            cacheSource: 'none',
            buildMs: 0,
            searchMs: 0,
          });
    key = createHash('sha256').update(key).update(JSON.stringify(rows)).digest('hex');
    const next = this.chain.catch(() => {}).then(() => this.request(key, rows, query, k, signal));
    this.chain = next;
    return next;
  }
  private request(
    key: string,
    rows: { id: string; values: number[] }[],
    query: number[],
    k: number,
    signal?: AbortSignal,
  ): Promise<any> {
    if (signal?.aborted) return Promise.reject(new AppError('CANCELLED', 'Cancelled'));
    if (!this.worker) {
      const worker = (this.worker = new Worker(new URL('./ann-worker.cjs', import.meta.url)));
      worker.unref();
      worker.on('message', (m) => {
        const pending = this.pending.get(m.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(m.id);
        worker.unref();
        if (m.error) pending.reject(new AppError('ANN_FAILED', m.error));
        else {
          this.generation = m.key;
          pending.resolve(m);
        }
      });
      worker.on('error', (e) => this.fail(e));
      worker.on('exit', (code) => {
        if (this.worker === worker) {
          this.worker = undefined;
          this.generation = '';
          if (code) this.fail(new Error('ANN worker exited ' + code));
        }
      });
    }
    return new Promise((resolve, reject) => {
      const id = ++this.serial,
        worker = this.worker!;
      const abort = () => this.close();
      const clean = () => signal?.removeEventListener('abort', abort);
      const timer = setTimeout(() => this.close(), 120000);
      this.pending.set(id, {
        timer,
        resolve: (v) => {
          clean();
          resolve(v);
        },
        reject: (e) => {
          clean();
          reject(e);
        },
      });
      signal?.addEventListener('abort', abort, { once: true });
      worker.ref();
      worker.postMessage({
        cacheDirectory: this.cacheDirectory,
        id,
        key,
        rows: this.generation === key ? undefined : rows,
        query,
        k,
      });
    });
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.generation = '';
  }
  close() {
    const worker = this.worker;
    this.worker = undefined;
    this.generation = '';
    this.fail(new AppError('ANN_INTERRUPTED', 'ANN build/search interrupted; retry explicitly.'));
    void worker?.terminate();
  }
}
