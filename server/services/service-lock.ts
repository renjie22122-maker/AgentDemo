import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function lockService(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'service-lock.sqlite'));
  try {
    db.exec(
      'PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner(id INTEGER); BEGIN EXCLUSIVE;',
    );
  } catch {
    db.close();
    throw Error(
      'Another AgentDemo service owns this data directory. Stop it before opening a second service.',
    );
  }
  return () => db.close();
}
