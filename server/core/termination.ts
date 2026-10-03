import { AppError } from './errors.js';
import type { Run } from '../../shared/types.js';
export function termination(error: unknown, aborted = false): NonNullable<Run['termination']> {
  const code = error instanceof AppError ? error.code : 'EXECUTION_FAILED';
  if (aborted || code === 'CANCELLED')
    return { code: 'CANCELLED', category: 'cancelled', recoverable: true };
  if (code === 'STEP_LIMIT') return { code, category: 'limit', recoverable: true };
  if (code === 'STAGNATION') return { code, category: 'stagnation', recoverable: true };
  if (['MODEL_INCOMPLETE', 'MODEL_PROTOCOL', 'TOOL_ARGUMENTS', 'DUPLICATE_CALL_ID'].includes(code))
    return { code, category: 'protocol', recoverable: true };
  return { code, category: 'execution', recoverable: false };
}
