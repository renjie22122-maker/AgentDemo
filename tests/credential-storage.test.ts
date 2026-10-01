import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  protectSettings,
  restoreSettings,
  windowsSecrets,
} from '../server/services/credential-storage.js';
import { Configuration } from '../server/services/settings.js';
const codec = {
  seal: (s: string) => Buffer.from(s).toString('base64'),
  open: (s: string) => Buffer.from(s, 'base64').toString(),
};
test('protected settings preserve model, embedding and media secrets without putting keys in plaintext fields', () => {
  const config = new Configuration(join(mkdtempSync(join(tmpdir(), 'vault-')), 'config.json'), {
    secretCodec: codec,
  });
  const path = join(mkdtempSync(join(tmpdir(), 'vault-save-')), 'config.json');
  const value = {
    ...config.get(),
    defaultProfileId: 'p',
    media: {
      ...config.get().media,
      connections: [
        {
          id: 'm',
          name: 'Media',
          protocol: 'openai-image' as const,
          kind: 'image' as const,
          baseUrl: 'https://example.com',
          model: 'image',
          apiKey: 'media-secret',
          enabled: false,
          defaults: {},
          estimatedUsd: null,
        },
      ],
    },
    embedding: { baseUrl: 'https://example.com', model: 'e', apiKey: 'embedding-secret' },
    profiles: [
      {
        id: 'p',
        name: 'P',
        transport: 'openai-chat' as const,
        baseUrl: 'https://example.com',
        model: 'm',
        apiKey: 'profile-secret',
      },
    ],
  };
  const target = new Configuration(path, { secretCodec: codec });
  target.save(value);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(raw.profiles[0].apiKey, '');
  assert.equal(raw.embedding.apiKey, '');
  assert.ok(raw.credentialEnvelope);
  assert.equal(raw.media.connections[0].apiKey, '');
  const reopened = new Configuration(path, { secretCodec: codec });
  assert.equal(reopened.profile('p').apiKey, 'profile-secret');
  assert.equal(reopened.get().embedding.apiKey, 'embedding-secret');
  assert.equal(reopened.get().media!.connections[0].apiKey, 'media-secret');
  assert.ok(!JSON.stringify(reopened.public()).includes('profile-secret'));
  assert.throws(() => restoreSettings(raw), /original Windows/);
  const before = readFileSync(path, 'utf8');
  const broken = new Configuration(path, {
    secretCodec: {
      ...codec,
      seal: () => {
        throw Error('codec unavailable');
      },
    },
  });
  assert.throws(() => broken.save({ ...broken.get(), agentName: 'Changed' }));
  assert.equal(readFileSync(path, 'utf8'), before);
});
test(
  'Windows DPAPI encrypts and decrypts with actual OS protection',
  { skip: process.platform !== 'win32' },
  () => {
    const plain = 'agentdemo-fixture-secret-' + Date.now();
    const encrypted = windowsSecrets.seal(plain);
    assert.ok(!encrypted.includes(plain));
    assert.equal(windowsSecrets.open(encrypted), plain);
  },
);
test('empty settings do not create a secret envelope', () => {
  const c = new Configuration(join(mkdtempSync(join(tmpdir(), 'vault-empty-')), 'config.json'));
  assert.equal('credentialEnvelope' in protectSettings(c.get(), codec), false);
});
