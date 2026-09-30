import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Settings } from '../../shared/types.js';
import { assert } from '../core/errors.js';
export class McpHub {
  private clients = new Map<
    string,
    { client: Client; transport: StdioClientTransport; fingerprint: string }
  >();
  async connect(server: Settings['mcp'][number]) {
    assert(server.enabled, 'MCP_DISABLED', 'MCP server is not enabled.');
    const fingerprint = JSON.stringify(server),
      old = this.clients.get(server.id);
    if (old?.fingerprint === fingerprint) return old.client;
    if (old) {
      await old.client.close();
      this.clients.delete(server.id);
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
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env,
      stderr: 'pipe',
    });
    // Remote server stderr may contain credentials. Do not mirror it into chat or logs.
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'AgentDemo', version: '0.1.0' });
    try {
      await client.connect(transport, { timeout: 20000 });
    } catch (error) {
      await transport.close().catch(() => {});
      throw error;
    }
    this.clients.set(server.id, { client, transport, fingerprint });
    return client;
  }
  async list(server: Settings['mcp'][number]) {
    const client = await this.connect(server);
    return (await client.listTools({}, { timeout: 20000 })).tools;
  }
  async call(
    server: Settings['mcp'][number],
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const client = await this.connect(server);
    const catalog = await client.listTools({}, { timeout: 20000 });
    assert(
      catalog.tools.some((t) => t.name === name),
      'MCP_TOOL_UNKNOWN',
      'Unknown MCP tool.',
    );
    return client.callTool({ name, arguments: args }, undefined, { timeout: 120000, signal });
  }
  async close() {
    await Promise.allSettled([...this.clients.values()].map((c) => c.client.close()));
    this.clients.clear();
  }
}
