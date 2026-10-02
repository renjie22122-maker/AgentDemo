import { Worker } from 'node:worker_threads';
let worker: Worker | undefined;
let chain: Promise<unknown> = Promise.resolve();
export function closeLocalEmbedding() {
  const w = worker;
  worker = undefined;
  void w?.terminate();
}
export function localEncode(
  texts: string[],
  purpose: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const run = chain
    .catch(() => {})
    .then(
      () =>
        new Promise<number[][]>((resolve, reject) => {
          if (signal?.aborted) return reject(new Error('Embedding cancelled'));
          const w = (worker ||= new Worker(
            new URL('./local-embedding-worker.cjs', import.meta.url),
          ));
          w.ref();
          const clean = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            w.removeListener('message', message);
            w.removeListener('error', fail);
            w.removeListener('exit', exit);
            w.unref();
          };
          const fail = (e: Error) => {
            clean();
            closeLocalEmbedding();
            reject(e);
          };
          const abort = () => fail(new Error('Embedding cancelled'));
          const exit = () => fail(new Error('Local embedding worker stopped'));
          const message = (m: any) => {
            if (m.error) return fail(new Error(m.error));
            clean();
            resolve(m.vectors);
          };
          const timer = setTimeout(
            () => fail(new Error('Local embedding timed out (model download may need retry)')),
            600000,
          );
          signal?.addEventListener('abort', abort, { once: true });
          w.once('message', message);
          w.once('error', fail);
          w.once('exit', exit);
          w.postMessage({ texts, purpose });
        }),
    );
  chain = run;
  return run;
}
