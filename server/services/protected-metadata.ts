import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NotStartedError } from '../core/errors.js';
export function dockerMetadataMasks(root: string): string[] {
  const args: string[] = [];
  const walk = (folder: string) => {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, e.name);
      if (e.isSymbolicLink())
        throw new NotStartedError(
          'LINKED_WORKSPACE',
          'Docker workspace contains a linked entry; use a clean isolated copy.',
        );
      if (['.git', '.agentdemo'].includes(e.name.toLowerCase())) {
        if (!e.isDirectory())
          throw new NotStartedError(
            'PROTECTED_METADATA_FILE',
            'Metadata file mounts require an isolated copy without repository metadata.',
          );
        const target = '/workspace/' + relative(root, file).replaceAll('\\', '/');
        if (target.includes(',') || target.includes(':'))
          throw new NotStartedError(
            'INVALID_MOUNT',
            'Protected path cannot be represented safely as a Docker mount.',
          );
        args.push('--tmpfs', target + ':ro,noexec,nosuid,size=1m,mode=000');
      } else if (e.isDirectory()) walk(file);
    }
  };
  try {
    walk(root);
  } catch (e) {
    if (e instanceof NotStartedError) throw e;
    throw new NotStartedError('WORKSPACE_PREFLIGHT', String(e));
  }
  return args;
}
