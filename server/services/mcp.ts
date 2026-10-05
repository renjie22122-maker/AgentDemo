import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Settings } from '../../shared/types.js';
import { assert } from '../core/errors.js';
export class McpHub {
  constructor(private stateDirectory?: string) {}
  private clients = new Map<
    string,
    { client: Client; transport: StdioClientTransport; fingerprint: string }
  >();
  private closing = false;
  private connecting = new Map<string, { fingerprint: string; promise: Promise<Client> }>();
  async connect(server: Settings['mcp'][number], scope = 'global'): Promise<Client> {
    assert(!this.closing, 'MCP_CLOSING', 'MCP service is shutting down.');
    const key = JSON.stringify([server.id, scope]),
      fingerprint = JSON.stringify(server);
    const pending = this.connecting.get(key);
    if (pending) {
      if (pending.fingerprint === fingerprint) return pending.promise;
      await pending.promise.catch(() => {});
      return this.connect(server, scope);
    }
    const work = this.open(server, key);
    this.connecting.set(key, { fingerprint, promise: work });
    try {
      return await work;
    } finally {
      this.connecting.delete(key);
    }
  }
  private async open(server: Settings['mcp'][number], key: string) {
    assert(server.enabled, 'MCP_DISABLED', 'MCP server is not enabled.');
    const fingerprint = JSON.stringify(server),
      old = this.clients.get(key);
    if (old?.fingerprint === fingerprint) return old.client;
    if (old) {
      await old.client.close();
      this.clients.delete(key);
    }
    const env: Record<string, string> = {};
    for (const key of [
      'PATH',
      'Path',
      'SystemRoot',
      'WINDIR',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    if (server.builtin === 'browser') {
      env.AGENTDEMO_BROWSER_HOSTS = JSON.stringify(server.browser?.allowedHosts || []);
      if (server.browser?.persistSession) {
        assert(
          this.stateDirectory,
          'BROWSER_STORAGE',
          'Persistent browser storage is unavailable.',
        );
        const folder = join(
          this.stateDirectory,
          createHash('sha256').update(JSON.parse(key)[1]).digest('hex'),
        );
        mkdirSync(folder, { recursive: true });
        env.AGENTDEMO_BROWSER_STATE = join(
          folder,
          createHash('sha256').update(server.id).digest('hex') + '.json',
        );
      }
    }
    const transport = new StdioClientTransport({
      command: server.builtin ? process.execPath : server.command,
      args: server.builtin
        ? [
            '--import',
            'tsx',
            fileURLToPath(new URL('../interactive-mcp.ts', import.meta.url)),
            server.builtin,
          ]
        : server.args,
      env,
      stderr: 'pipe',
    });
    // Remote server stderr may contain credentials. Do not mirror it into chat or logs.
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'Amadeus', version: '0.1.0' });
    try {
      await client.connect(transport, { timeout: 20000 });
    } catch (error) {
      await transport.close().catch(() => {});
      throw error;
    }
    this.clients.set(key, { client, transport, fingerprint });
    client.onclose = () => {
      if (this.clients.get(key)?.client === client) this.clients.delete(key);
    };
    return client;
  }
  async list(server: Settings['mcp'][number], scope = 'global') {
    const client = await this.connect(server, scope);
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 20000 });
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor) {
        assert(
          !seen.has(cursor) && seen.size < 100,
          'MCP_PAGINATION',
          'MCP catalog pagination exceeded its bound.',
        );
        seen.add(cursor);
      }
    } while (cursor);
    return tools;
  }
  async call(
    server: Settings['mcp'][number],
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    scope = 'global',
  ) {
    const client = await this.connect(server, scope);
    const catalog = await this.list(server, scope);
    assert(
      catalog.some((t) => t.name === name),
      'MCP_TOOL_UNKNOWN',
      'Unknown MCP tool.',
    );
    return client.callTool({ name, arguments: args }, undefined, { timeout: 120000, signal });
  }
  async closeScope(scope: string) {
    for (const [key, pending] of this.connecting)
      if (JSON.parse(key)[1] === scope) await pending.promise.catch(() => {});
    for (const [key, connection] of this.clients)
      if (JSON.parse(key)[1] === scope) {
        await connection.client.close();
        this.clients.delete(key);
      }
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.connecting.values()].map((x) => x.promise));
    await Promise.allSettled([...this.clients.values()].map((c) => c.client.close()));
    this.clients.clear();
  }
}
