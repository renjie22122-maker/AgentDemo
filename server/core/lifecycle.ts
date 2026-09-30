import type { RunStatus } from '../../shared/types.js';
import { AppError } from './errors.js';
const transitions: Record<RunStatus, RunStatus[]> = {
  queued: ['running', 'interrupted', 'failed'],
  running: [
    'waiting_user',
    'waiting_approval',
    'waiting_children',
    'completed',
    'failed',
    'interrupted',
  ],
  waiting_user: ['running', 'interrupted', 'failed'],
  waiting_approval: ['running', 'interrupted', 'failed'],
  waiting_children: ['running', 'interrupted', 'failed'],
  completed: [],
  failed: [],
  interrupted: [],
};
export const terminal = (status: RunStatus) =>
  ['completed', 'failed', 'interrupted'].includes(status);
export function checkTransition(from: RunStatus, to: RunStatus) {
  if (from !== to && !transitions[from].includes(to))
    throw new AppError('INVALID_TRANSITION', from + ' cannot transition to ' + to, 409);
}
