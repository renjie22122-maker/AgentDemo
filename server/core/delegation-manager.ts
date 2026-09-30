import { Isolations } from '../services/isolation.js';
import type { Run, Conversation } from '../../shared/types.js';
import type { ToolContext } from '../tools/registry.js';
import type { Configuration } from '../services/settings.js';
import { Store, id } from '../storage/store.js';
import type { EventEmitter } from 'node:events';
import { assert, abortError } from './errors.js';
import { terminal } from './lifecycle.js';
interface DelegationHost {
  context(run: Run): Promise<ToolContext>;
  start(
    conversationId: string,
    message: string,
    maxSteps: number,
    options: { parentRunId: string; depth: number; fresh: boolean; controlTicket?: string },
  ): Run;
  signal(runId: string): AbortSignal | undefined;
  pump(): void;
  steer(conversationId: string, message: string): void;
}
export class DelegationManager {
  private pendingSpawns = new Map<string, number>();
  private waitingOn = new Map<string, string[]>();
  constructor(
    private store: Store,
    private config: Configuration,
    private directory: string,
    private bus: EventEmitter,
    private host: DelegationHost,
  ) {}
  async spawn(
    parent: Run,
    task: string,
    deliverable: string,
    mode: 'read-only' | 'isolated' = 'read-only',
    controlTicket?: string,
  ) {
    const settings = this.config.get();
    assert(
      parent.depth < settings.maxAgentDepth,
      'DEPTH_LIMIT',
      'Configured delegation depth reached.',
    );
    const root = this.root(parent);
    assert(
      this.store.runs().filter((r) => r.parentRunId && this.root(r) === root).length +
        (this.pendingSpawns.get(root) || 0) <
        settings.maxChildren,
      'CHILD_LIMIT',
      'Configured total child limit reached for this run tree.',
    );
    this.pendingSpawns.set(root, (this.pendingSpawns.get(root) || 0) + 1);
    try {
      const c = this.store.get<Conversation>('conversation', parent.conversationId),
        now = Date.now();
      assert(c.teamStrategy !== 'off', 'DELEGATION_DISABLED', 'User disabled delegation.');
      assert(
        mode !== 'isolated' || (c.permission !== 'read-only' && !!c.projectId),
        'DELEGATION_PERMISSION',
        'Writable delegation requires a writable project task.',
      );
      const isolation =
        mode === 'isolated'
          ? await new Isolations(this.store, this.directory).create(
              parent.id,
              (await this.host.context(parent)).files,
            )
          : null;
      const child = {
        ...c,
        isolationId: isolation?.id || c.isolationId,
        id: id(),
        title: task.slice(0, 65),
        permission: mode === 'isolated' ? c.permission : ('read-only' as const),
        parentId: c.id,
        forkEvent: null,
        createdAt: now,
        updatedAt: now,
      };
      assert(
        !this.host.signal(parent.id)?.aborted,
        'CANCELLED',
        'Parent was cancelled during copy preparation.',
      );
      this.store.put('conversation', child);
      const run = this.host.start(
        child.id,
        (mode === 'isolated'
          ? 'Independent isolated task. Write only to this copy; the parent must review and merge changes.\n'
          : 'Independent read-only task:\n') +
          task +
          '\nRequired deliverable:\n' +
          deliverable,
        0,
        { parentRunId: parent.id, depth: parent.depth + 1, fresh: true, controlTicket },
      );
      this.store.event(c.id, parent.id, 'child.started', {
        runId: run.id,
        conversationId: child.id,
        task,
        deliverable,
      });
      return run.id;
    } finally {
      this.pendingSpawns.set(root, Math.max(0, (this.pendingSpawns.get(root) || 1) - 1));
    }
  }
  async reviewChanges(parent: Run, key: string, version?: string) {
    const child = this.store.get<Run>('run', key);
    assert(
      child.parentRunId === parent.id && child.status === 'completed',
      'MERGE_SCOPE',
      'Only a completed direct child can be integrated.',
    );
    assert(
      !this.store.runs().some((r) => r.parentRunId === child.id && !terminal(r.status)),
      'CHILD_ACTIVE',
      'Child has active descendants.',
    );
    const conversation = this.store.get<Conversation>('conversation', child.conversationId);
    assert(conversation.isolationId, 'NOT_ISOLATED', 'Child has no isolated copy.');
    const service = new Isolations(this.store, this.directory);
    assert(
      service.get(conversation.isolationId).parentRunId === parent.id,
      'MERGE_SCOPE',
      'Not owned by this parent.',
    );
    return version
      ? service.merge(conversation.isolationId, version)
      : service.inspect(conversation.isolationId);
  }
  private root(run: Run): string {
    let r = run;
    while (r.parentRunId) r = this.store.get<Run>('run', r.parentRunId);
    return r.id;
  }
  async wait(parent: Run, keys: string[], signal: AbortSignal) {
    for (const key of keys)
      assert(
        this.root(this.store.get<Run>('run', key)) === this.root(parent) && key !== parent.id,
        'TEAM_SCOPE',
        'Cannot wait on an unrelated task.',
      );
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (this.waitingOn.get(from) || []).some((k) => reaches(k, target, seen));
    };
    for (const key of keys) {
      let ancestor = parent.parentRunId;
      while (ancestor) {
        assert(ancestor !== key, 'WAIT_CYCLE', 'A child cannot wait on its ancestor.');
        ancestor = this.store.get<Run>('run', ancestor).parentRunId;
      }
      assert(!reaches(key, parent.id), 'WAIT_CYCLE', 'Delegation wait would create a cycle.');
    }
    this.waitingOn.set(parent.id, keys);
    this.store.transition(parent.id, 'waiting_children');
    this.host.pump();
    try {
      await Promise.all(
        keys.map(
          (key) =>
            new Promise<void>((resolve, reject) => {
              const done = () => {
                if (terminal(this.store.get<Run>('run', key).status)) {
                  cleanup();
                  resolve();
                }
              };
              const abort = () => {
                cleanup();
                reject(abortError());
              };
              const cleanup = () => {
                this.bus.off('finished', done);
                signal.removeEventListener('abort', abort);
              };
              this.bus.on('finished', done);
              signal.addEventListener('abort', abort, { once: true });
              if (signal.aborted) abort();
              else done();
            }),
        ),
      );
    } finally {
      this.waitingOn.delete(parent.id);
      if (!signal.aborted && this.store.get<Run>('run', parent.id).status === 'waiting_children')
        this.store.transition(parent.id, 'running');
    }
    return keys.map((key) => {
      const r = this.store.get<Run>('run', key);
      return {
        runId: key,
        status: r.status,
        error: r.error,
        answer:
          this.store
            .events(r.conversationId)
            .filter((e) => e.type === 'assistant.message')
            .at(-1)?.data.text || '',
        usage: { input: r.inputTokens, output: r.outputTokens, cost: r.estimatedUsd },
      };
    });
  }
  message(parent: Run, key: string, message: string) {
    const target = this.store.get<Run>('run', key);
    assert(this.root(target) === this.root(parent), 'TEAM_SCOPE', 'Cannot message unrelated tasks');
    assert(!terminal(target.status), 'TASK_FINISHED', 'Task already finished');
    this.host.steer(target.conversationId, '[Team message from ' + parent.id + '] ' + message);
  }
}
