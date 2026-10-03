import { diagnoseFailure, type FailureDiagnosis } from './failure-diagnosis.js';
import { evaluateRetrieval } from './retrieval-evaluation.js';
import { Configuration } from './settings.js';
import { GraphLearning } from './graph-learning.js';
import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Store } from '../storage/store.js';
import { Knowledge } from './knowledge.js';
import { Embeddings } from './embedding.js';
import { FileScope, inside } from './paths.js';
import { extractIsolated } from './document-parser.js';
import { createReadStream } from 'node:fs';
async function fileHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export interface SourceIssue {
  path: string;
  stage: string;
  error: string;
  hash?: string;
  attempts: number;
  revision: number;
}
export interface KnowledgeWatch {
  id: string;
  enabled: boolean;
  paths: string[];
  target: string;
  revision: number;
  status?: string;
  scan?: { files: number; updated: number; unchanged: number };
  issues?: SourceIssue[];
  skipped?: { excluded: number; links: number; unsupported: number };
  error?: string;
  updatedAt?: number;
  failures?: number;
  nextRetryAt?: number;
  failureKind?: string;
  diagnosis?: FailureDiagnosis;
  failedRevision?: string;
  graphProfileId?: string;
  graphTarget?: string;
}
const formats = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.docx',
  '.xlsx',
  '.pdf',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
]);
export class KnowledgeMaintenance {
  private timer?: ReturnType<typeof setInterval>;
  private task?: Promise<void>;
  private stopped = false;
  constructor(
    private store: Store,
    private knowledge: Knowledge,
    private embeddings: Embeddings,
    private directory: string,
    private config?: Configuration,
    private parse: (path: string) => Promise<string> = extractIsolated,
  ) {}
  start() {
    this.timer = setInterval(() => void this.tick(), 30000);
    this.timer.unref();
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.task;
  }
  tick() {
    return (this.task ||= this.scan().finally(() => {
      this.task = undefined;
    }));
  }
  recheck(scope: string) {
    const w = this.store.get<KnowledgeWatch>('knowledge-watch', scope);
    if (!w.enabled || !this.current(w))
      throw Error('Scope disabled or destination changed; review the knowledge settings first.');
    for (const job of this.store.list<any>('knowledge-index-job')) {
      const doc = this.store.maybe<any>('document', job.id.split('|')[0]);
      if (doc?.scope === scope && job.status !== 'completed')
        this.store.remove('knowledge-index-job', job.id);
    }
    return this.store.put('knowledge-watch', {
      ...w,
      revision: w.revision + 1,
      failures: 0,
      nextRetryAt: undefined,
      failedRevision: undefined,
      status: 'pending',
      error: undefined,
      diagnosis: undefined,
    });
  }
  private current(w: KnowledgeWatch) {
    const v = this.store.maybe<KnowledgeWatch>('knowledge-watch', w.id);
    if (w.id.startsWith('project:')) {
      const p = this.store.maybe<any>('project', w.id.slice(8));
      if (
        !p ||
        p.removedAt ||
        !w.paths.every((path) => p.folders.some((root: string) => inside(root, path)))
      )
        return false;
    } else if (w.id !== 'general' && !this.store.maybe('conversation', w.id.slice(8))) return false;

    return (
      !this.stopped &&
      v?.enabled &&
      v.revision === w.revision &&
      v.target === this.embeddings.fingerprint()
    );
  }
  private async scan() {
    for (let w of this.store.list<KnowledgeWatch>('knowledge-watch')) {
      if (!w.enabled || this.stopped) continue;
      const connectionRevision = this.embeddings.recoveryRevision?.();
      if (w.failedRevision && connectionRevision !== w.failedRevision && this.current(w)) {
        w = this.recheck(w.id);
      }
      // Migrate the old whole-folder size failure; retain the authorized scope/service.
      if (w.error?.startsWith('Source exceeds 25 MB:')) w = this.recheck(w.id);
      if ((w.failures || 0) >= 3 && w.failureKind !== 'transient') continue;
      if ((w.nextRetryAt || 0) > Date.now()) continue;
      try {
        if (w.target !== this.embeddings.fingerprint() || !this.embeddings.enabled())
          throw Error(
            'Embedding service changed; save the scope configuration to authorize the new destination.',
          );
        const project = w.id.startsWith('project:')
          ? this.store.maybe<any>('project', w.id.slice(8))
          : w.id === 'general'
            ? { folders: w.paths }
            : null;
        if (w.id.startsWith('project:') && (!project || project.removedAt))
          throw Error('Project is unavailable.');
        const files: string[] = [];
        const issues: SourceIssue[] = [];
        const skipped = { excluded: 0, links: 0, unsupported: 0 };
        let traversalFailed = false;
        let indexError: unknown;
        const issue = (path: string, stage: string, error: unknown, hash?: string) => {
          const old = w.issues?.find(
            (x) =>
              x.path === path && x.stage === stage && x.hash === hash && x.revision === w.revision,
          );
          issues.push({
            path,
            stage,
            hash,
            error: String((error as any)?.message || error).slice(0, 500),
            attempts: (old?.attempts || 0) + 1,
            revision: w.revision,
          });
        };
        let visited = 0;
        const scope = project && new FileScope(project.folders, this.directory);
        const walk = async (path: string): Promise<void> => {
          if (!this.current(w)) throw Error('Configuration changed');
          if (++visited % 128 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
          if (!scope) throw Error('Folder watching requires a project scope');
          // Resolve against the matching declared project root.
          const root = project.folders.findIndex(
            (r: string) =>
              path === r ||
              path.toLowerCase().startsWith(r.toLowerCase() + '\\') ||
              path.startsWith(r + '/'),
          );
          if (root < 0) throw Error('Source is outside the project');
          const { relative } = await import('node:path');
          const safe = await scope.resolve(
            '@' + root + '/' + relative(project.folders[root], path),
          );
          const stat = await lstat(safe);
          if (stat.isDirectory()) {
            for (const entry of await readdir(safe, { withFileTypes: true })) {
              if (
                entry.name.startsWith('.') ||
                ['node_modules', 'dist', 'build', 'vendor'].includes(entry.name)
              ) {
                skipped.excluded++;
                continue;
              }
              if (entry.isSymbolicLink()) {
                skipped.links++;
                continue;
              }
              try {
                await walk(join(safe, entry.name));
              } catch (e) {
                traversalFailed = true;
                issue(join(safe, entry.name), 'scan', e);
              }
            }
          } else if (formats.has(extname(safe).toLowerCase())) {
            files.push(safe);
          } else {
            skipped.unsupported++;
          }
        };
        this.store.put('knowledge-watch', { ...w, status: 'processing', error: undefined });
        for (const path of w.paths) {
          try {
            await walk(path);
          } catch (e: any) {
            if (e.code !== 'ENOENT') {
              traversalFailed = true;
              issue(path, 'scan', e);
            }
          }
        }
        let updated = 0,
          unchanged = 0;
        for (const path of [...new Set(files)]) {
          if (!this.current(w)) return;
          const key = createHash('sha256')
            .update(w.id + '|' + path)
            .digest('hex');
          const old = this.store.maybe<any>('knowledge-source', key);
          let hash: string | undefined;
          try {
            hash = await fileHash(path);
            const failed = w.issues?.find(
              (x) =>
                x.path === path &&
                x.stage === 'parse' &&
                x.hash === hash &&
                x.revision === w.revision,
            );
            if (failed && failed.attempts >= 3) {
              issues.push(failed);
              continue;
            }
            if (old?.hash === hash && !old.removed) {
              unchanged++;
              continue;
            }
            const text = await this.parse(path);
            if ((await fileHash(path)) !== hash)
              throw Error('Source changed during parsing; retry on the next scan.');
            if (!this.current(w)) return;
            const doc: any = this.knowledge.import(w.id, basename(path), text, {
              source: path,
              revisionOf: old?.removed ? undefined : old?.documentId,
            });
            updated++;
            this.store.put('knowledge-source', {
              id: key,
              scope: w.id,
              path,
              hash,
              documentId: doc.id,
              removed: false,
            });
          } catch (e) {
            issue(path, 'parse', e, hash);
            // A failed replacement must not leave stale facts searchable.
            if (old && hash && old.hash !== hash) {
              const doc = this.store.maybe<any>('document', old.documentId);
              if (doc) this.store.put('document', { ...doc, validUntil: Date.now() });
              this.store.put('knowledge-source', { ...old, removed: true });
            }
          }
        }
        if (!this.current(w)) return;
        for (const old of this.store
          .list<any>('knowledge-source')
          .filter(
            (x) => !traversalFailed && x.scope === w.id && !x.removed && !files.includes(x.path),
          )) {
          const doc = this.store.maybe<any>('document', old.documentId);
          if (doc) this.store.put('document', { ...doc, validUntil: Date.now() });
          this.store.put('knowledge-source', { ...old, removed: true });
        }
        for (const doc of this.store
          .list<any>('document')
          .filter((d) => d.scope === w.id && d.validUntil == null)) {
          if (!this.current(w)) return;
          try {
            if (this.config && w.graphProfileId && w.graphTarget)
              await new GraphLearning(this.store, this.config).document(
                doc,
                w.graphProfileId,
                w.graphTarget,
                () =>
                  !!this.current(w) &&
                  this.store.maybe<KnowledgeWatch>('knowledge-watch', w.id)?.graphTarget ===
                    w.graphTarget,
              );
            const key = doc.id + '|' + w.target;
            const attempt = this.store.maybe<any>('knowledge-index-job', key);
            if (attempt?.status === 'completed') continue;
            if (attempt?.attempts >= 3 && w.failureKind !== 'transient')
              throw Error('Index retries exhausted; save configuration to retry.');
            this.store.put('knowledge-index-job', {
              id: key,
              attempts: (attempt?.attempts || 0) + 1,
              status: 'running',
            });
            await this.knowledge.index(doc.id, () => !!this.current(w));
            if (!this.current(w)) return;
            this.store.put('knowledge-index-job', {
              id: key,
              attempts: (attempt?.attempts || 0) + 1,
              status: 'completed',
            });
          } catch (e) {
            issue(doc.name, 'index', e);
            indexError = e;
          }
        }
        if (this.current(w)) await evaluateRetrieval(this.store, this.knowledge, w.id);
        if (this.current(w))
          this.store.put('knowledge-watch', {
            ...w,
            status: issues.length ? 'partial' : 'synced',
            issues,
            skipped,
            scan: { files: new Set(files).size, updated, unchanged },
            failures: 0,
            failureKind: indexError
              ? diagnoseFailure(indexError).automatic
                ? 'transient'
                : 'configuration'
              : undefined,
            nextRetryAt:
              indexError && diagnoseFailure(indexError).automatic ? Date.now() + 30000 : undefined,
            updatedAt: Date.now(),
            error: undefined,
            diagnosis: undefined,
            failedRevision: indexError ? this.embeddings.recoveryRevision?.() : undefined,
          });
      } catch (e: any) {
        const diagnosis = diagnoseFailure(e);
        const transient = diagnosis.automatic;
        if (this.store.maybe<KnowledgeWatch>('knowledge-watch', w.id)?.revision === w.revision)
          this.store.put('knowledge-watch', {
            ...w,
            status: 'needs_attention',
            failures: (w.failures || 0) + 1,
            failureKind: transient ? 'transient' : 'configuration',
            diagnosis,
            failedRevision: this.embeddings.recoveryRevision?.(),
            nextRetryAt: transient
              ? Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(w.failures || 0, 7))
              : undefined,
            error: String(e.message || e).slice(0, 500),
            updatedAt: Date.now(),
          });
      }
    }
  }
}
