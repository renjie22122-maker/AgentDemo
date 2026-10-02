import { diagnoseFailure, type FailureDiagnosis } from './failure-diagnosis.js';
import { evaluateRetrieval } from './retrieval-evaluation.js';
import { Configuration } from './settings.js';
import { GraphLearning } from './graph-learning.js';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Store } from '../storage/store.js';
import { Knowledge } from './knowledge.js';
import { Embeddings } from './embedding.js';
import { FileScope, inside } from './paths.js';
import { extract } from './documents.js';
export interface KnowledgeWatch {
  id: string;
  enabled: boolean;
  paths: string[];
  target: string;
  revision: number;
  status?: string;
  scan?: { files: number; updated: number; unchanged: number };
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
        let visited = 0;
        const scope = project && new FileScope(project.folders, this.directory);
        const walk = async (path: string): Promise<void> => {
          if (!this.current(w)) throw Error('Configuration changed');
          if (++visited > 10000) throw Error('Too many source entries; narrow the source folders.');
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
              )
                continue;
              if (entry.isSymbolicLink()) continue;
              await walk(join(safe, entry.name));
            }
          } else if (formats.has(extname(safe).toLowerCase())) {
            if (stat.size > 25 * 1024 * 1024)
              throw Error('Source exceeds 25 MB: ' + basename(safe));
            files.push(safe);
            if (files.length > 1000)
              throw Error('More than 1000 source files; narrow the watched paths.');
          }
        };
        this.store.put('knowledge-watch', { ...w, status: 'processing', error: undefined });
        for (const path of w.paths) {
          try {
            await walk(path);
          } catch (e: any) {
            if (e.code !== 'ENOENT') throw e;
          }
        }
        let updated = 0,
          unchanged = 0;
        for (const path of [...new Set(files)]) {
          if (!this.current(w)) return;
          const key = createHash('sha256')
            .update(w.id + '|' + path)
            .digest('hex');
          const hash = createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
          const old = this.store.maybe<any>('knowledge-source', key);
          if (old?.hash === hash && !old.removed) {
            unchanged++;
            continue;
          }
          const text = await extract(path, { ocr: true });
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
        }
        if (!this.current(w)) return;
        for (const old of this.store
          .list<any>('knowledge-source')
          .filter((x) => x.scope === w.id && !x.removed && !files.includes(x.path))) {
          const doc = this.store.maybe<any>('document', old.documentId);
          if (doc) this.store.put('document', { ...doc, validUntil: Date.now() });
          this.store.put('knowledge-source', { ...old, removed: true });
        }
        for (const doc of this.store
          .list<any>('document')
          .filter((d) => d.scope === w.id && d.validUntil == null)) {
          if (!this.current(w)) return;
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
        }
        if (this.current(w)) await evaluateRetrieval(this.store, this.knowledge, w.id);
        if (this.current(w))
          this.store.put('knowledge-watch', {
            ...w,
            status: 'synced',
            scan: { files: new Set(files).size, updated, unchanged },
            failures: 0,
            failureKind: undefined,
            nextRetryAt: undefined,
            updatedAt: Date.now(),
            error: undefined,
            diagnosis: undefined,
            failedRevision: undefined,
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
