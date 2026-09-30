import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './http/app.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { app } = await createApp({
  directory: process.env.AGENTDEMO_DATA_DIR || join(root, '.data'),
  dist: join(root, 'dist'),
});
const port = Number(process.env.PORT || 8810);
await app.listen({ host: '127.0.0.1', port });
console.log('AgentDemo is ready at http://127.0.0.1:' + port);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
