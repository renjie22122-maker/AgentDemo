import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lockService } from '../server/services/service-lock.js';
test('data directory refuses a second service owner and unlocks after close', () => {
  const dir = mkdtempSync(join(tmpdir(), 'service-lock-'));
  const close = lockService(dir);
  assert.throws(() => lockService(dir), /Another AgentDemo/);
  close();
  lockService(dir)();
});
