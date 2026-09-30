import { secureDirectory } from './services/private-file.js';
import { lockService } from './services/service-lock.js';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './http/app.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
secureDirectory(process.env.AGENTDEMO_DATA_DIR || join(root, '.data'));
const release = lockService(process.env.AGENTDEMO_DATA_DIR || join(root, '.data'));
process.on('exit', release);
const { app } = await createApp({
  directory: process.env.AGENTDEMO_DATA_DIR || join(root, '.data'),
  dist: join(root, 'dist'),
});
const port = Number(process.env.PORT || 8810);
await app.listen({ host: '127.0.0.1', port });
console.log('AgentDemo is ready at http://127.0.0.1:' + port);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
