import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ToolRegistry } from './registry.js';
import { NotStartedError, errorMessage } from '../core/errors.js';
export const textHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function patchedText(original: string, edits: { oldText: string; newText: string }[]) {
  let result = original;
  for (const edit of edits) {
    if (!edit.oldText || result.split(edit.oldText).length !== 2)
      throw new NotStartedError('PATCH_CONFLICT', 'Each hunk must match exactly once in sequence.');
    result = result.replace(edit.oldText, edit.newText);
  }
  if (Buffer.byteLength(result) > 1000000)
    throw new NotStartedError('PATCH_SIZE', 'Result exceeds 1 MB.');
  return result;
}
export function installPatch(registry: ToolRegistry) {
  registry.add({
    name: 'apply_patch',
    effect: 'write',
    description:
      'Apply structured exact-context hunks to up to 20 existing UTF-8 files. Obtain expectedSha256 from inspect_file_version. All files are validated before writes; each is rechecked before writing. Returns per-file receipts and explicit partial failure. Not a filesystem transaction or syntax validation; never blindly replay. Does not create/delete/rename files.',
    schema: z.object({
      files: z
        .array(
          z.object({
            path: z.string().min(1),
            expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
            edits: z
              .array(z.object({ oldText: z.string().min(1), newText: z.string() }))
              .min(1)
              .max(100),
          }),
        )
        .min(1)
        .max(20),
    }),
    run: async (a, c) => {
      const prepared: { path: string; before: string; after: string; content: string }[] = [];
      const names = new Set<string>();
      for (const f of a.files) {
        c.signal.throwIfAborted();
        const resolved = await c.files.resolve(f.path, true),
          key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
        if (names.has(key))
          throw new NotStartedError('PATCH_DUPLICATE', 'A file may only occur once.');
        names.add(key);
        const original = await c.files.read(f.path, 1000000);
        if (textHash(original) !== f.expectedSha256)
          throw new NotStartedError('PATCH_STALE', 'File changed: ' + f.path);
        const content = patchedText(original, f.edits);
        prepared.push({
          path: f.path,
          before: f.expectedSha256,
          after: textHash(content),
          content,
        });
      }
      const applied: unknown[] = [];
      let attempted: string | undefined;
      try {
        for (const f of prepared) {
          c.signal.throwIfAborted();
          if (textHash(await c.files.read(f.path, 1000000)) !== f.before)
            throw new Error('File changed before write: ' + f.path);
          attempted = f.path;
          c.beforeExecution?.({ path: f.path, sha256: f.after });
          await c.files.write(f.path, f.content);
          applied.push({ path: f.path, before: f.before, after: f.after });
          attempted = undefined;
        }
      } catch (error) {
        if (!applied.length && !attempted) throw error;
        return {
          content: JSON.stringify({
            applied,
            uncertainPath: attempted,
            error: errorMessage(error),
            replay: false,
          }),
          outcome: { status: 'failed' as const, code: 'PATCH_PARTIAL', executionStarted: true },
        };
      }
      return { content: JSON.stringify({ applied, syntaxVerified: false, atomic: false }) };
    },
  });
  registry.add({
    name: 'inspect_file_version',
    effect: 'read',
    parallelSafe: true,
    description:
      'Return SHA-256 of scoped UTF-8 content for patch preconditions. This does not assert authorship or correctness.',
    schema: z.object({ path: z.string().min(1) }),
    run: async (a, c) => {
      const s = await c.files.read(a.path, 1000000);
      return {
        content: JSON.stringify({ path: a.path, sha256: textHash(s), bytes: Buffer.byteLength(s) }),
      };
    },
  });
}
