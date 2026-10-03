/** Read-only transport recovery. Never retries a task submission or a tool. */
export function connectLive(
  url: string,
  handlers: Record<string, (event: MessageEvent) => void>,
  status: (value: string) => void,
  prepare: () => Promise<unknown> = async () => {},
) {
  let source: EventSource | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false,
    failures = 0,
    last = Date.now(),
    generation = 0;
  let cursor = 0;
  const close = () => {
    source?.close();
    source = undefined;
  };
  const failed = () => {
    if (stopped || !source) return;
    close();
    generation++;
    if (failures >= 5) {
      status('Disconnected · 5 retries exhausted');
      return;
    }
    failures++;
    status('Reconnecting · ' + failures + '/5');
    timer = setTimeout(() => void open(), Math.min(16000, 1000 * 2 ** (failures - 1)));
  };
  async function open() {
    const version = ++generation;
    try {
      await prepare();
      if (stopped || version !== generation) return;
      source = new EventSource(
        cursor ? url + (url.includes('?') ? '&' : '?') + 'after=' + cursor : url,
      );
      last = Date.now();
      source.onerror = failed;
      for (const [name, handler] of Object.entries(handlers))
        source.addEventListener(name, (e) => {
          const event = e as MessageEvent;
          if (name === 'agent' && event.lastEventId) {
            const id = Number(event.lastEventId);
            if (Number.isSafeInteger(id)) {
              if (id <= cursor) return;
              cursor = id;
            }
          }
          last = Date.now();
          handler(event);
        });
      source.addEventListener('heartbeat', () => {
        last = Date.now();
        failures = 0;
        status('Connected');
      });
      source.addEventListener('ready', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          if (Number.isSafeInteger(data.cursor)) cursor = data.cursor;
        } catch {}
        last = Date.now();
        status('Connected');
      });
    } catch {
      if (stopped || version !== generation) return;
      // A failed bootstrap is a failed connection too.
      source = { close() {} } as EventSource;
      failed();
    }
  }
  const watchdog = setInterval(() => {
    if (source && Date.now() - last > 45000) failed();
  }, 5000);
  void open();
  return {
    close() {
      stopped = true;
      generation++;
      close();
      clearTimeout(timer);
      clearInterval(watchdog);
    },
    retry() {
      if (stopped) return;
      clearTimeout(timer);
      close();
      failures = 0;
      status('Connecting');
      void open();
    },
  };
}
