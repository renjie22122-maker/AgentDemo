import { Teams } from './team-space.js';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { FileScope } from './paths.js';
import type { Run } from '../../shared/types.js';
import { Store } from '../storage/store.js';
import { assert } from '../core/errors.js';
import { TaskBoard, rootRun, type Board } from './task-board.js';
export interface ArtifactStamp {
  scope: string;
  files: Record<string, string>;
  complete: boolean;
}
export async function stamp(files: FileScope, paths: string[]): Promise<ArtifactStamp> {
  const result: ArtifactStamp = { scope: JSON.stringify(files.roots), files: {}, complete: true };
  let total = 0;
  for (const path of [...new Set(paths)].sort()) {
    try {
      const resolved = await files.resolve(path),
        size = (await stat(resolved)).size;
      if (size > 4_000_000 || (total += size) > 16_000_000) throw Error('size limit');
      result.files[path] = createHash('sha256')
        .update(await readFile(resolved))
        .digest('hex');
    } catch {
      result.complete = false;
    }
  }
  return result;
}
export function sameStamp(a: ArtifactStamp, b: ArtifactStamp) {
  return (
    a.complete &&
    b.complete &&
    a.scope === b.scope &&
    JSON.stringify(a.files) === JSON.stringify(b.files)
  );
}
export class Verification {
  constructor(private store: Store) {}
  async record(
    run: Run,
    files: FileScope,
    taskId: string,
    revision: number,
    eventId: number,
    committed?: (board: Board) => void,
  ) {
    const board = new TaskBoard(this.store).get(run),
      task = board.tasks.find((t) => t.id === taskId);
    assert(task && board.revision === revision, 'PLAN_CHANGED', 'Read the latest task board.');
    assert(
      new Teams(this.store).authority(run, 'reviewer') || task.owner === run.id,
      'TASK_OWNER',
      'Only owner or lead can record verification.',
    );
    assert(
      task.status === 'done',
      'TASK_NOT_DONE',
      'Record verification after the task is marked done.',
    );
    assert(
      task.artifacts?.length,
      'NO_ARTIFACTS',
      'Declare the task artifact paths before checking.',
    );
    const row = this.store.db
      .prepare('SELECT run_id,type,data FROM events WHERE id=?')
      .get(eventId) as any;
    assert(
      row?.type === 'tool.completed',
      'VERIFICATION_EVIDENCE',
      'Select a completed check result.',
    );
    assert(
      rootRun(this.store, this.store.get<Run>('run', row.run_id)) === board.id,
      'VERIFICATION_SCOPE',
      'Evidence belongs to another team.',
    );
    const data = JSON.parse(row.data),
      evidence = data.verification;
    assert(
      evidence?.passed === true,
      'VERIFICATION_FAILED',
      'Evidence is not a successful observed command or file read.',
    );
    assert(
      board.tasks.length && task.evidence.includes(eventId),
      'VERIFICATION_EVIDENCE',
      'Add the evidence to this task first.',
    );
    const current = await stamp(files, task.artifacts);
    assert(
      evidence.before?.scope === current.scope && evidence.after?.scope === current.scope,
      'VERIFICATION_SCOPE',
      'Evidence came from a different workspace copy.',
    );
    for (const path of task.artifacts)
      assert(
        current.complete &&
          current.files[path] &&
          evidence.checkedPaths?.includes(path) &&
          evidence.before.files[path] === current.files[path] &&
          evidence.after.files[path] === current.files[path],
        'VERIFICATION_STALE',
        'Artifacts changed, were omitted, or did not exist during the check. Recheck current files.',
      );
    return this.store.transaction(() => {
      const latest = new TaskBoard(this.store).get(run);
      assert(latest.revision === revision, 'PLAN_CHANGED', 'Task changed while checking files.');
      const target = latest.tasks.find((t) => t.id === taskId)!;
      target.verification = { status: 'checked', eventId, checkedBy: row.run_id, stamp: current };
      latest.revision++;
      this.store.put('task-board', latest);
      committed?.(latest);
      return latest;
    });
  }
  async refresh(run: Run, files: FileScope): Promise<Board> {
    const board = new TaskBoard(this.store).get(run);
    let changed = false;
    for (const task of board.tasks) {
      if (task.verification?.status !== 'checked') continue;
      if (run.id !== board.id && task.owner !== run.id) continue;
      const current = await stamp(files, task.artifacts || []);
      if (!sameStamp(task.verification.stamp, current)) {
        task.verification.status = 'stale';
        changed = true;
      }
    }
    if (changed) {
      const latest = new TaskBoard(this.store).get(run);
      if (latest.revision !== board.revision) return this.refresh(run, files);
      board.revision++;
      this.store.put('task-board', board);
    }
    return board;
  }
}
