import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { z } from 'zod';
import { id } from '../storage/store.js';
import { assert } from '../core/errors.js';
import type { ToolRegistry } from './registry.js';
export function installArtifacts(registry: ToolRegistry) {
  registry.add({
    name: 'inspect_artifact',
    effect: 'read',
    description:
      'Recheck registered artifact bytes against its original hash. Report current, stale, missing or inaccessible; never imply semantic correctness.',
    schema: z.object({ id: z.string() }),
    run: async (a, c) => {
      const artifact = c.store.get<any>('tool-artifact', a.id);
      assert(
        artifact.conversationId === c.run.conversationId,
        'ARTIFACT_SCOPE',
        'Artifact belongs to another conversation.',
      );
      let state = 'inaccessible';
      let currentHash: string | undefined;
      try {
        const file = await c.files.resolve(artifact.path),
          before = await stat(file);
        assert(before.isFile(), 'ARTIFACT_FILE', 'Not a regular file');
        const hash = createHash('sha256'),
          deadline = Date.now() + 30000;
        for await (const chunk of createReadStream(file)) {
          c.signal.throwIfAborted();
          assert(Date.now() < deadline, 'ARTIFACT_TIMEOUT', 'Inspection deadline');
          hash.update(chunk);
        }
        const after = await stat(await c.files.resolve(artifact.path));
        currentHash = hash.digest('hex');
        state =
          before.size === after.size &&
          before.mtimeMs === after.mtimeMs &&
          before.ctimeMs === after.ctimeMs &&
          currentHash === artifact.sha256
            ? 'current'
            : 'stale';
      } catch (e: any) {
        c.signal.throwIfAborted();
        state = e.code === 'ENOENT' ? 'missing' : 'inaccessible';
      }
      c.store.put('tool-artifact', {
        ...artifact,
        observedState: state,
        checkedAt: Date.now(),
        currentHash,
      });
      return { content: JSON.stringify({ id: a.id, state, currentHash, verified: false }) };
    },
  });
  registry.add({
    name: 'retire_artifact',
    effect: 'coordinate',
    description:
      'Retire an artifact registration in this conversation. Keeps its audit and disk file; does not delete content.',
    schema: z.object({ id: z.string() }),
    run: (a, c) => {
      const artifact = c.store.get<any>('tool-artifact', a.id);
      assert(
        artifact.conversationId === c.run.conversationId,
        'ARTIFACT_SCOPE',
        'Artifact belongs to another conversation.',
      );
      c.store.put('tool-artifact', { ...artifact, retiredAt: Date.now() });
      return { content: JSON.stringify({ id: a.id, retired: true, fileDeleted: false }) };
    },
  });

  registry.add({
    name: 'register_artifact',
    effect: 'read',
    description:
      'Record a scoped existing file as an artifact with hash, size, MIME hint and producing run. Does not upload, modify, execute or prove correctness. File must remain unchanged during hashing.',
    schema: z.object({ path: z.string().min(1).max(2048), taskId: z.string().max(80).optional() }),
    run: async (a, c) => {
      const file = await c.files.resolve(a.path),
        before = await stat(file);
      assert(before.isFile(), 'ARTIFACT_FILE', 'Choose a regular file.');
      const hash = createHash('sha256'),
        deadline = Date.now() + 30000;
      let size = 0;
      for await (const chunk of createReadStream(file)) {
        c.signal.throwIfAborted();
        assert(
          Date.now() < deadline,
          'ARTIFACT_TIMEOUT',
          'Hashing deadline reached; artifact was not registered.',
        );
        hash.update(chunk);
        size += chunk.length;
      }
      const after = await stat(await c.files.resolve(a.path));
      assert(
        size === before.size &&
          after.size === before.size &&
          after.mtimeMs === before.mtimeMs &&
          after.ctimeMs === before.ctimeMs,
        'ARTIFACT_CHANGED',
        'File changed during hashing.',
      );
      const mime: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.html': 'text/html',
        '.json': 'application/json',
        '.zip': 'application/zip',
        '.csv': 'text/csv',
      };
      const artifact = {
        id: id(),
        conversationId: c.run.conversationId,
        runId: c.run.id,
        taskId: a.taskId || null,
        path: a.path,
        mime: mime[extname(file).toLowerCase()] || 'application/octet-stream',
        bytes: size,
        sha256: hash.digest('hex'),
        createdAt: Date.now(),
        verified: false,
      };
      c.store.put('tool-artifact', artifact);
      c.store.event(c.run.conversationId, c.run.id, 'tool.artifact', {
        callId: c.callId,
        ...artifact,
      });
      return { content: JSON.stringify(artifact) };
    },
  });
  registry.add({
    name: 'list_artifacts',
    effect: 'read',
    parallelSafe: true,
    description:
      'List registered artifacts in this conversation. Hashes describe registration time; do not assume files remain unchanged.',
    schema: z.object({
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    run: (a, c) => {
      const all = c.store
        .list<any>('tool-artifact')
        .filter((x) => x.conversationId === c.run.conversationId)
        .sort((a, b) => b.createdAt - a.createdAt);
      return {
        content: JSON.stringify({
          total: all.length,
          artifacts: all.slice(a.offset, a.offset + a.limit),
          nextOffset: a.offset + a.limit < all.length ? a.offset + a.limit : null,
        }),
      };
    },
  });
}
