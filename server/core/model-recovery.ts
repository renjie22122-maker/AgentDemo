import { AppError } from './errors.js';

// Only failed model requests are retried. Never use this for tool execution.
export function transientModelFailure(error: unknown): boolean {
  if (error instanceof AppError) {
    if (
      ['MODEL_TIMEOUT', 'MODEL_STREAM_IDLE', 'TRUNCATED_STREAM', 'INVALID_STREAM'].includes(
        error.code,
      )
    )
      return true;
    if (error.code === 'MODEL_INCOMPLETE')
      return (error as AppError & { finishReason?: string }).finishReason === '';
    return false;
  }
  const e = error as { code?: string; cause?: unknown; name?: string; message?: string } | null;
  if (!e || e.name === 'AbortError') return false;
  if (
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EAI_AGAIN',
      'ENOTFOUND',
      'ETIMEDOUT',
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
    ].includes(e.code || '')
  )
    return true;
  if (e.cause && e.cause !== error) return transientModelFailure(e.cause);
  return e.name === 'TypeError' && ['fetch failed', 'terminated'].includes(e.message || '');
}
export const modelReconnectDelay = (attempt: number) =>
  Math.min(2000 * 2 ** Math.max(0, attempt - 1), 30000);
