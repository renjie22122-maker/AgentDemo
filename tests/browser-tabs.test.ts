import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { McpHub } from '../server/services/mcp.js';

test(
  'owned browser retains popup, selects results, closes only chosen tab',
  {
    skip:
      process.env.AGENTDEMO_BROWSER_TEST !== '1'
        ? 'Requires explicit installed-browser integration opt-in; skipped, not passed'
        : false,
    timeout: 60000,
  },
  async () => {
    const http = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        req.url?.startsWith('/results')
          ? '<title>Search results</title><p id="result">动态规划 matched</p>'
          : '<title>Search form</title><form target="_blank" action="/results"><input name="q"><button>Search</button></form>',
      );
    });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const hub = new McpHub();
    try {
      const client = await hub.connect(
        {
          id: 'tabs',
          name: 'Browser',
          enabled: true,
          builtin: 'browser',
          command: '',
          args: [],
        } as any,
        'fixture',
      );
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        const r: any = await client.callTool({ name, arguments: args });
        assert.ok(!r.isError, JSON.stringify(r));
        return r.content.filter((x: any) => x.type === 'text').map((x: any) => JSON.parse(x.text));
      };
      const before = await call('browser_tabs');
      assert.equal(before[0].tabs.length, 0);
      const port = (http.address() as any).port;
      await call('browser_navigate', { url: 'http://127.0.0.1:' + port });
      await call('browser_fill', { selector: 'input', text: '动态规划' });
      await call('browser_click', { selector: 'button' });
      let tabs: any[] = [];
      for (let i = 0; i < 20; i++) {
        tabs = (await call('browser_tabs'))[0].tabs;
        if (tabs.some((t) => t.url.includes('/results'))) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(tabs.length, 2);
      const result = tabs.find((t) => t.url.includes('/results'));
      assert.ok(result);
      assert.equal(result.active, false);
      await call('browser_select_tab', { tabId: result.tabId });
      const snapshot = (await call('browser_snapshot'))[0];
      assert.match(snapshot.text, /动态规划 matched/);
      assert.ok(snapshot.url.includes('q='));
      const shot: any = await client.callTool({ name: 'browser_screenshot', arguments: {} });
      assert.ok(shot.content.some((x: any) => x.type === 'image'));
      await call('browser_close_tab', { tabId: result.tabId });
      assert.equal((await call('browser_tabs'))[0].tabs.length, 1);
      await call('browser_close');
      assert.equal((await call('browser_tabs'))[0].tabs.length, 0);
    } finally {
      await hub.close();
      await new Promise<void>((r) => http.close(() => r()));
    }
  },
);
