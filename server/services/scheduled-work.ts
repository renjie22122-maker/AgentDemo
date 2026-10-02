import { Store, id } from '../storage/store.js';
import { terminal } from '../core/lifecycle.js';
export interface ScheduledWork {
  id: string;
  conversationId: string;
  prompt: string;
  enabled: boolean;
  dueAt: number;
  intervalMs?: number;
  jobId?: string;
  status: string;
  runId?: string;
  lastRunId?: string;
  error?: string;
  target?: string;
}
export class ScheduledWorkService {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private store: Store,
    private runtime: any,
  ) {}
  start() {
    this.timer = setInterval(() => this.tick(), 5000);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
  }
  tick(now = Date.now()) {
    for (const task of this.store.list<ScheduledWork>('scheduled-work')) {
      if (!task.enabled) continue;
      try {
        const c = this.store.maybe<any>('conversation', task.conversationId);
        if (
          !c ||
          c.archived ||
          (c.projectId &&
            (!this.store.maybe<any>('project', c.projectId) ||
              this.store.maybe<any>('project', c.projectId)?.removedAt))
        )
          throw Error('Conversation or project unavailable.');
        const profile = this.runtime.config.profile(c.profileId);
        if (
          task.target &&
          task.target !== JSON.stringify([profile.id, profile.baseUrl, c.projectId])
        )
          throw Error('Model destination or project changed; re-enable this schedule explicitly.');
        if (task.runId) {
          const run = this.store.maybe<any>('run', task.runId);
          if (run && !terminal(run.status)) continue;
          if (run && run.status !== 'completed')
            throw Error(
              'Scheduled run ' + run.status + '; inspect its conversation before resuming.',
            );
          if (run) {
            this.store.put('scheduled-work', {
              ...task,
              lastRunId: run.id,
              runId: undefined,
              enabled: !!task.intervalMs,
              status: task.intervalMs ? 'waiting' : 'completed',
              dueAt: now + (task.intervalMs || 0),
            });
            continue;
          }
          // Run record is persisted before execution. Absence means dispatch never reached execution.
        }
        if (task.dueAt > now || this.runtime.active(c.id)) continue;
        if (task.jobId) {
          const job = this.store.maybe<any>('command-job', task.jobId);
          if (!job || job.conversationId !== c.id)
            throw Error('Trigger job missing or outside conversation.');
          if (['failed', 'cancelled', 'denied', 'unknown'].includes(job.status))
            throw Error('Trigger job ' + job.status + '; do not replay it.');
          if (job.status !== 'completed') continue;
        }
        if (this.store.unknownEffects(c.id).length)
          throw Error('Uncertain side effects require inspection; automatic replay refused.');
        const runId = task.runId || id();
        this.store.put('scheduled-work', { ...task, runId, status: 'dispatching' });
        this.runtime.start(c.id, task.prompt, 0, { runId });
        this.store.put('scheduled-work', { ...task, runId, status: 'running' });
      } catch (e: any) {
        this.store.put('scheduled-work', {
          ...this.store.get<ScheduledWork>('scheduled-work', task.id),
          enabled: false,
          status: 'needs_attention',
          error: String(e.message || e),
        });
      }
    }
  }
}
