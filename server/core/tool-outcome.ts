import type { ToolOutcome } from '../../shared/types.js';
/** Legacy decoding is restricted to historical records lacking typed outcomes. */
export function resultSucceeded(data: any): boolean {
  if (data.outcome)
    return data.outcome.status === 'succeeded' && data.outcome.code !== 'COMMAND_SCHEDULED';
  if (String(data.output).startsWith('Tool error:') || String(data.output).startsWith('DENIED'))
    return false;
  if (data.name === 'run_command') {
    try {
      const r = JSON.parse(data.output);
      return r.code === 0 && !r.timedOut && !r.aborted;
    } catch {
      return false;
    }
  }
  return true;
}
export function commandOutcome(result: any): ToolOutcome {
  return {
    status:
      result.timedOut || result.aborted ? 'unknown' : result.code === 0 ? 'succeeded' : 'failed',
    code: result.timedOut
      ? 'COMMAND_TIMEOUT'
      : result.aborted
        ? 'COMMAND_CANCELLED'
        : result.code === 0
          ? 'OK'
          : 'COMMAND_EXIT',
    executionStarted: true,
  };
}
