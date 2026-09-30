import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AgentEvent, Conversation, PendingInput, Run } from '../../shared/types.js';
import { assert } from '../core/errors.js';
import { checkTransition, terminal } from '../core/lifecycle.js';
export const id = () => randomUUID();
export class Store {
  readonly db: DatabaseSync;
  private transactionDepth = 0;
  private pendingEvents: AgentEvent[] = [];
  onEvent: (event: AgentEvent) => void = () => {};
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL,run_id TEXT,type TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS events_conversation ON events(conversation_id,id);
      CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
      CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,scope TEXT NOT NULL,document_id TEXT NOT NULL,name TEXT NOT NULL,ordinal INTEGER NOT NULL,text TEXT NOT NULL,vector TEXT,source_hash TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chunks_scope ON chunks(scope);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(id UNINDEXED,terms);
      CREATE TABLE IF NOT EXISTS ledger(request_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS effects(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,tool TEXT NOT NULL,args TEXT NOT NULL,state TEXT NOT NULL,result TEXT);
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS records_runs_conversation ON records(json_extract(data,'$.conversationId'),json_extract(data,'$.createdAt')) WHERE kind='run';
      INSERT OR IGNORE INTO schema_migrations VALUES(1,unixepoch()*1000);
    `);
  }
  close() {
    this.db.close();
  }
  put<T extends { id: string }>(kind: string, value: T): T {
    this.db
      .prepare(
        'INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',
      )
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  get<T>(kind: string, key: string): T {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, key) as
      { data: string } | undefined;
    assert(row, 'NOT_FOUND', kind + ' not found', 404);
    return JSON.parse(row.data) as T;
  }
  maybe<T>(kind: string, key: string): T | undefined {
    try {
      return this.get<T>(kind, key);
    } catch {
      return undefined;
    }
  }
  list<T>(kind: string): T[] {
    return (
      this.db.prepare('SELECT data FROM records WHERE kind=?').all(kind) as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  remove(kind: string, key: string) {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, key);
  }
  transaction<T>(fn: () => T): T {
    const depth = this.transactionDepth,
      mark = this.pendingEvents.length;
    const savepoint = 'nested_' + depth;
    this.db.exec(depth ? 'SAVEPOINT ' + savepoint : 'BEGIN IMMEDIATE');
    this.transactionDepth++;
    let value: T;
    try {
      value = fn();
      if (value && typeof (value as any).then === 'function')
        throw new Error('SQLite transactions must be synchronous.');
      this.db.exec(depth ? 'RELEASE ' + savepoint : 'COMMIT');
    } catch (error) {
      this.pendingEvents.length = mark;
      this.db.exec(depth ? 'ROLLBACK TO ' + savepoint + '; RELEASE ' + savepoint : 'ROLLBACK');
      throw error;
    } finally {
      this.transactionDepth--;
    }
    if (!depth) {
      const events = this.pendingEvents.splice(0);
      for (const event of events) this.onEvent(event);
    }
    return value;
  }
  event(
    conversationId: string,
    runId: string | null,
    type: string,
    data: Record<string, any>,
  ): AgentEvent {
    const now = Date.now();
    const row = this.db
      .prepare('INSERT INTO events(conversation_id,run_id,type,data,created_at) VALUES(?,?,?,?,?)')
      .run(conversationId, runId, type, JSON.stringify(data), now);
    const event = {
      id: Number(row.lastInsertRowid),
      conversationId,
      runId,
      type,
      data,
      createdAt: now,
    };
    if (this.transactionDepth) this.pendingEvents.push(event);
    else this.onEvent(event);
    return event;
  }
  events(conversationId: string, after = 0): AgentEvent[] {
    return (
      this.db
        .prepare('SELECT * FROM events WHERE conversation_id=? AND id>? ORDER BY id')
        .all(conversationId, after) as any[]
    ).map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      runId: r.run_id,
      type: r.type,
      data: JSON.parse(r.data),
      createdAt: r.created_at,
    }));
  }
  conversations() {
    return this.list<Conversation>('conversation').sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    );
  }
  runs(conversationId?: string) {
    const rows = conversationId
      ? this.db
          .prepare(
            "SELECT data FROM records WHERE kind='run' AND json_extract(data,'$.conversationId')=? ORDER BY json_extract(data,'$.createdAt')",
          )
          .all(conversationId)
      : this.db
          .prepare(
            "SELECT data FROM records WHERE kind='run' ORDER BY json_extract(data,'$.createdAt')",
          )
          .all();
    return (rows as { data: string }[]).map((r) => JSON.parse(r.data) as Run);
  }
  transition(runId: string, status: Run['status'], error: string | null = null) {
    const run = this.get<Run>('run', runId);
    checkTransition(run.status, status);
    const next = this.put('run', { ...run, status, error, updatedAt: Date.now() });
    this.event(run.conversationId, run.id, 'run.status', { status, error });
    return next;
  }
  recover() {
    for (const run of this.runs().filter((r) => !terminal(r.status))) {
      this.transition(
        run.id,
        'interrupted',
        'The service restarted. Inspect unfinished operations before continuing.',
      );
      for (const q of this.list<PendingInput>('input').filter(
        (q) => q.runId === run.id && q.status === 'pending',
      ))
        this.put('input', { ...q, status: 'cancelled' });
    }
  }
  beginEffect(runId: string, tool: string, args: Record<string, unknown>) {
    const key = id();
    this.db
      .prepare('INSERT INTO effects(id,run_id,tool,args,state) VALUES(?,?,?,?,?)')
      .run(key, runId, tool, JSON.stringify(args), 'started');
    return key;
  }
  endEffect(key: string, result: string, state = 'completed') {
    this.db.prepare('UPDATE effects SET state=?,result=? WHERE id=?').run(state, result, key);
  }
  unknownEffects(conversationId: string) {
    const runs = new Set(this.runs(conversationId).map((r) => r.id));
    return (this.db.prepare("SELECT * FROM effects WHERE state='started'").all() as any[]).filter(
      (e) => runs.has(e.run_id),
    );
  }
  reconcileKnownEffects(conversationId: string): string[] {
    const unresolved = this.unknownEffects(conversationId),
      events = this.events(conversationId),
      resolved: string[] = [];
    for (const e of unresolved) {
      const failure = events.find((v) => v.type === 'effect.unknown' && v.data.effectId === e.id)
        ?.data.reason;
      let reason = '';
      if (
        e.tool === 'run_command' &&
        [
          'Tool error: spawn docker ENOENT',
          'Tool error: Windows native isolation requires an absolute Python interpreter path in Settings. No host fallback.',
        ].includes(failure)
      )
        reason = 'Logged launch precondition failed before the requested command started.';
      if (
        e.tool === 'edit_file' &&
        failure === 'Tool error: Expected exactly one match. Read the current file and retry.'
      )
        reason = 'Logged exact-match validation failed before writing.';
      if (
        e.tool === 'run_command' &&
        unresolved.filter((x) => x.run_id === e.run_id).length === 1
      ) {
        const q = this.list<PendingInput>('input')
          .filter((q) => q.runId === e.run_id && q.kind === 'approval')
          .at(-1);
        const run = this.get<Run>('run', e.run_id);
        if (
          q?.status === 'cancelled' &&
          q.answer === null &&
          terminal(run.status) &&
          q.payload.command === JSON.parse(e.args).command &&
          !events.some((v) => v.type === 'input.answered' && v.data.id === q.id)
        )
          reason = 'Interrupted while awaiting approval; no approval was granted.';
      }
      if (reason) {
        this.resolveEffect(e.id, 'Automatic reconciliation: ' + reason + ' No replay performed.');
        resolved.push(e.id);
      }
    }
    return resolved;
  }
  resolveEffect(key: string, note: string) {
    assert(note.trim(), 'NOTE_REQUIRED', 'Record what was inspected.');
    this.endEffect(key, note, 'inspected');
  }
}
