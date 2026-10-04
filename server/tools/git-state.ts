import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { NotStartedError } from '../core/errors.js';
export function parseGitStatus(text: string) {
  const entries = text.split('\0').filter(Boolean),
    files: { status: string; path: string; originalPath?: string }[] = [];
  let branch = '';
  for (let i = 0; i < entries.length; i++) {
    const line = entries[i];
    if (line.startsWith('## ')) {
      branch = line.slice(3);
      continue;
    }
    const status = line.slice(0, 2),
      path = line.slice(3);
    const originalPath = /[RC]/.test(status) ? entries[++i] : undefined;
    files.push({ status, path, ...(originalPath ? { originalPath } : {}) });
  }
  return {
    branch,
    dirty: files.length > 0,
    files,
    conflicts: files.filter((f) => f.status.includes('U') || ['AA', 'DD'].includes(f.status)),
    authorship: 'unknown',
  };
}
export function installGitState(registry: ToolRegistry) {
  registry.add({
    name: 'inspect_git_state',
    effect: 'coordinate',
    description:
      'Observe Git porcelain status (branch, staged/unstaged/untracked/conflicts) via the normal approved command backend. No mutation, checkout, restore or ownership claims. Disabled command channels still refuse. Saves a per-run initial observation for comparison.',
    schema: z.object({ folder: z.number().int().min(0).default(0) }),
    run: async (a, c) => {
      if (!c.invokeTool) throw new NotStartedError('GIT_CONTEXT', 'Audited runtime required.');
      const result = await c.invokeTool(
        'run_command',
        {
          folder: a.folder,
          command:
            'git --no-optional-locks -c core.fsmonitor=false status --porcelain=v1 -z --branch --untracked-files=normal',
          timeoutSeconds: 30,
          reason: 'Observe repository state without changing files or staging.',
        },
        0,
      );
      if (result.outcome?.status !== 'succeeded') return result;
      const command = JSON.parse(result.content);
      if (command.truncated)
        throw new Error('Git status was truncated; no complete repository state recorded.');
      const current = parseGitStatus(command.stdout);
      const key = c.run.id + ':' + a.folder,
        baseline = c.store.maybe<any>('git-baseline', key);
      if (!baseline)
        c.store.put('git-baseline', {
          id: key,
          conversationId: c.conversation.id,
          runId: c.run.id,
          at: Date.now(),
          state: current,
        });
      return {
        content: JSON.stringify({
          current,
          baseline: baseline?.state || current,
          note: 'Baseline is first observation, not proof of who changed each file.',
        }),
      };
    },
  });
  registry.add({
    name: 'inspect_git_diff',
    effect: 'coordinate',
    description:
      'Read tracked staged or unstaged Git diff through normal command approval and backend. External diff and text conversion are disabled. Untracked file contents are not included; inspect them with scoped file tools. This neither stages nor restores files.',
    schema: z.object({
      folder: z.number().int().min(0).default(0),
      staged: z.boolean().default(false),
    }),
    run: async (a, c) => {
      if (!c.invokeTool) throw new NotStartedError('GIT_CONTEXT', 'Audited runtime required.');
      return c.invokeTool(
        'run_command',
        {
          folder: a.folder,
          command:
            'git --no-pager --no-optional-locks -c core.fsmonitor=false diff --no-ext-diff --no-textconv --no-color' +
            (a.staged ? ' --cached' : '') +
            ' --',
          timeoutSeconds: 30,
          reason: 'Inspect tracked repository differences without staging or restoration.',
        },
        0,
      );
    },
  });
}
