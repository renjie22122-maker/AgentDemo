import { spawn } from 'node:child_process';
import { NotStartedError } from '../core/errors.js';
export const spawnProcess: typeof spawn = ((...args: Parameters<typeof spawn>) => {
  try {
    return spawn(...args);
  } catch (e: any) {
    throw new NotStartedError('SPAWN_NOT_STARTED', String(e.message || e));
  }
}) as typeof spawn;
