import type { Conversation, Run } from '../../shared/types.js';
import { Store, id } from '../storage/store.js';
import { assert } from '../core/errors.js';
import { terminal } from '../core/lifecycle.js';
import { rootRun, TaskBoard } from './task-board.js';
export interface TeamSpace {
  id: string;
  mode: 'host' | 'creative';
  revision: number;
  members: string[];
  roles: Record<'coordinator' | 'planner' | 'reviewer' | 'summarizer', string>;
  closed: Record<string, string>;
  maxMessages: number;
}
export class Teams {
  constructor(private store: Store) {}
  get(run: Run) {
    return this.store.maybe<TeamSpace>('team-space', rootRun(this.store, run));
  }
  authority(run: Run, role: keyof TeamSpace['roles'] = 'coordinator') {
    const team = this.get(run);
    return team ? team.roles[role] === run.id : run.id === rootRun(this.store, run);
  }
  configure(run: Run, mode: TeamSpace['mode'], members: string[], maxMessages: number) {
    assert(this.authority(run), 'TEAM_ROLE', 'Only current coordinator configures the team.');
    const root = rootRun(this.store, run),
      origin = this.store.get<Run>('run', root);
    const c = this.store.get<Conversation>('conversation', origin.conversationId);
    assert(
      c.teamStrategy !== 'off' && c.teamMode === mode,
      'TEAM_MODE',
      'Select this team mode in conversation controls first.',
    );
    assert(
      !this.get(run),
      'TEAM_EXISTS',
      'Team already exists; use role handoff rather than resetting state.',
    );
    assert(
      members.length >= 2 &&
        members.length <= 32 &&
        new Set(members).size === members.length &&
        members.includes(run.id),
      'TEAM_MEMBERS',
      'Choose 2–32 distinct members including coordinator.',
    );
    for (const key of members) {
      const r = this.store.get<Run>('run', key);
      assert(
        rootRun(this.store, r) === root && !terminal(r.status) && !r.recoveryOnly,
        'TEAM_SCOPE',
        'Enroll active members in this task tree.',
      );
    }
    assert(
      Number.isInteger(maxMessages) && maxMessages >= 1 && maxMessages <= 100,
      'TEAM_LIMIT',
      'Set 1–100 discussion messages per member.',
    );
    assert(
      this.store
        .runs()
        .filter((r) => rootRun(this.store, r) === root && !terminal(r.status))
        .every((r) => members.includes(r.id)),
      'TEAM_ROSTER',
      'Enroll all active members before fixing the team roster.',
    );
    const team: TeamSpace = {
      id: root,
      mode,
      revision: 1,
      members,
      roles: { coordinator: run.id, planner: run.id, reviewer: run.id, summarizer: run.id },
      closed: {},
      maxMessages,
    };
    this.store.put('team-space', team);
    this.audit(run, 'created', { mode, members, maxMessages });
    return team;
  }
  handoff(
    run: Run,
    role: keyof TeamSpace['roles'],
    target: string,
    revision: number,
    reason: string,
  ) {
    return this.store.transaction(() => {
      const t = this.get(run);
      assert(t && t.revision === revision, 'TEAM_CHANGED', 'Read current team revision.');
      assert(
        t.roles[role] === run.id || t.roles.coordinator === run.id,
        'TEAM_ROLE',
        'Only role holder or coordinator may hand off.',
      );
      const r = this.store.get<Run>('run', target);
      assert(
        t.members.includes(target) && !terminal(r.status) && !r.recoveryOnly && !t.closed[target],
        'TEAM_MEMBER',
        'Target must be an active participating member.',
      );
      const previous = t.roles[role];
      t.roles[role] = target;
      t.revision++;
      this.store.put('team-space', t);
      this.audit(run, 'role-handoff', { role, previous, target, reason });
      return t;
    });
  }
  post(run: Run, text: string, to: string[]) {
    return this.store.transaction(() => {
      const t = this.get(run);
      assert(
        t?.mode === 'creative' && t.members.includes(run.id) && !t.closed[run.id],
        'TEAM_DISCUSSION',
        'Join an open creative team before posting.',
      );
      const messages = this.messages(run);
      assert(
        messages.filter((m) => m.sender === run.id).length < t.maxMessages,
        'DISCUSSION_LIMIT',
        'Configured per-member discussion limit reached; summarize or end participation.',
      );
      const recipients = to.length ? [...new Set(to)] : t.members.filter((k) => k !== run.id);
      assert(
        recipients.every((k) => t.members.includes(k) && k !== run.id),
        'TEAM_SCOPE',
        'Recipients must be other team members.',
      );
      const sequence =
        this.store.list<any>('team-discussion').filter((m) => m.teamId === t.id).length + 1;
      const row = {
        id: id(),
        sequence,
        teamId: t.id,
        sender: run.id,
        recipients,
        text,
        at: Date.now(),
      };
      this.store.put('team-discussion', row);
      this.audit(run, 'discussion', { messageId: row.id });
      return row;
    });
  }
  messages(run: Run) {
    const t = this.get(run);
    return t
      ? this.store
          .list<any>('team-discussion')
          .filter(
            (m) => m.teamId === t.id && (m.sender === run.id || m.recipients.includes(run.id)),
          )
          .sort((a, b) => a.sequence - b.sequence)
      : [];
  }
  close(run: Run, summary: string) {
    const t = this.get(run);
    assert(t && t.members.includes(run.id), 'TEAM_MEMBER', 'Not an enrolled member.');
    assert(
      !this.store.unknownEffects(run.conversationId).length,
      'OUTCOME_UNKNOWN',
      'Resolve uncertain operations before ending participation.',
    );
    assert(
      !new TaskBoard(this.store)
        .get(run)
        .tasks.some(
          (x) =>
            x.owner === run.id &&
            (x.status !== 'done' ||
              x.verification?.status === 'stale' ||
              (x.artifacts?.length && x.verification?.status !== 'checked')),
        ),
      'TASK_INCOMPLETE',
      'Finish owned tasks or explicitly hand them off.',
    );
    t.closed[run.id] = summary;
    t.revision++;
    this.store.put('team-space', t);
    this.audit(run, 'participation-ended', { summary });
    return this.project(run);
  }
  project(run: Run) {
    const t = this.get(run);
    if (!t) return null;
    const tasks = new TaskBoard(this.store).get(run).tasks;
    const members = t.members.map((k) => this.store.get<Run>('run', k));
    const blockers: string[] = [];
    for (const r of members) {
      if (this.store.unknownEffects(r.conversationId).length)
        blockers.push('Uncertain operation: ' + r.id);
      const c = this.store.get<Conversation>('conversation', r.conversationId);
      if (c.isolationId && this.store.maybe<any>('isolation', c.isolationId)?.state !== 'merged')
        blockers.push('Isolated changes require integration: ' + r.id);
    }
    for (const task of tasks)
      if (
        task.status !== 'done' ||
        task.verification?.status === 'stale' ||
        (task.artifacts?.length && task.verification?.status !== 'checked')
      )
        blockers.push('Unfinished or unverified task: ' + task.id);
    if (t.mode === 'host' && !tasks.length) blockers.push('No declared tasks');
    const allEnded = members.every((r) => terminal(r.status));
    const unclosed = members.filter((r) => terminal(r.status) && r.status !== 'completed');
    for (const r of unclosed) blockers.push('Member interrupted or failed: ' + r.id);
    const status = allEnded ? (blockers.length ? 'blocked' : 'completed') : 'active';
    return {
      ...t,
      status,
      blockers,
      messages: this.messages(run),
      basis:
        t.mode === 'creative'
          ? 'Participation ended; not factual consensus or correctness verification.'
          : 'Task evidence and integration state; not a proof of semantic correctness.',
    };
  }
  private audit(run: Run, action: string, data: unknown) {
    this.store.event(run.conversationId, run.id, 'team.lifecycle', {
      teamId: rootRun(this.store, run),
      action,
      data,
    });
  }
}
