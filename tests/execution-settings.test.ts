import test from 'node:test';
import assert from 'node:assert/strict';
import { executionSettings } from '../shared/execution.js';
import type { Settings } from '../shared/types.js';
test('chat isolation overrides defaults without changing other chats or interpreter configuration', () => {
  const defaults = {
    commandBackend: 'approval-host',
    nativeNetwork: 'host',
    nativePython: 'C:/runtime/python.exe',
    dockerImage: 'local',
  } as Settings;
  const native = executionSettings(defaults, {
    execution: { backend: 'native-windows', network: 'deny' },
  });
  assert.equal(native.commandBackend, 'native-windows');
  assert.equal(native.nativeNetwork, 'deny');
  assert.equal(native.nativePython, defaults.nativePython);
  assert.equal(executionSettings(defaults, {}), defaults);
  assert.equal(defaults.commandBackend, 'approval-host');
  assert.equal(executionSettings(defaults, { execution: null }), defaults);
  const docker = executionSettings(defaults, { execution: { backend: 'docker', network: 'host' } });
  assert.equal(docker.nativeNetwork, 'deny');
});
