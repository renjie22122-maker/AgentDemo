let csrf = '';
export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch('/api' + path, {
    signal: AbortSignal.timeout(body === undefined ? 20000 : 120000),
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers:
      body === undefined || body instanceof FormData
        ? { 'X-CSRF-Token': csrf }
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value;
}
export async function bootstrap() {
  const value = await api('/bootstrap');
  csrf = value.csrf;
  return value;
}
