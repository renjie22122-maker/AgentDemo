import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Configuration } from '../server/services/settings.js';

test('brand upgrade preserves custom identity and existing settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'branding-'));
  try {
    const file = join(dir, 'settings.json');
    assert.equal(new Configuration(file).get().agentName, 'Amadeus');
    for (const name of ['AgentDemo', 'My Assistant']) {
      writeFileSync(file, JSON.stringify({ agentName: name, profiles: [], defaultProfileId: '' }));
      const config = new Configuration(file).get();
      assert.equal(config.agentName, name === 'AgentDemo' ? 'Amadeus' : name);
      assert.equal(config.commandBackend, 'approval-host');
      assert.deepEqual(config.profiles, []);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
