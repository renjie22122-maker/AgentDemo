export function ToolEcosystemSettings({ value, setValue, zh }: any) {
  const add = (builtin: string) =>
    setValue({
      ...value,
      mcp: [
        ...value.mcp,
        {
          id: crypto.randomUUID(),
          name: builtin === 'browser' ? 'Browser · isolated profile' : 'Computer · Windows host',
          command: '',
          args: [],
          enabled: false,
          builtin,
          capability: builtin,
        },
      ],
    });
  return (
    <section className="panel">
      <h2>{zh ? '工具生态与自动规则' : 'Tool ecosystem and rules'}</h2>
      <p className="muted">
        {zh
          ? '扩展默认关闭；启用后仍逐次审核操作。浏览器使用独立配置，但网络是宿主网络；桌面后端操作真实 Windows 桌面，不是虚拟机。'
          : 'Extensions start disabled; operations retain approval. Browser profiles are separate but use host networking. Computer control operates the real Windows desktop, not a VM.'}
      </p>
      <div className="row">
        <button onClick={() => add('browser')}>
          {zh ? '添加内置浏览器' : 'Add browser adapter'}
        </button>
        <button onClick={() => add('computer')}>
          {zh ? '添加 Windows 桌面' : 'Add Windows computer adapter'}
        </button>
      </div>
      <p className="muted">
        {zh
          ? '在下方 MCP 列表启用并保存。浏览器在 Windows 使用 Edge，其他平台需要已安装的 Playwright Chromium；不会自动下载。需要隔离桌面时，请配置你信任的 VM MCP 后端。'
          : 'Enable and save the entry in MCP settings below. Browser uses Edge on Windows or an installed Playwright Chromium elsewhere; no automatic downloads. Configure a trusted VM MCP backend for an isolated desktop.'}
      </p>
      <details>
        <summary>{zh ? '技能与扩展来源目录' : 'Skill and extension source catalog'}</summary>
        <p>
          {zh
            ? '这是来源目录，不是安全认证市场。先审查并下载到本机，再通过技能页导入；不会自动执行远程安装脚本。'
            : 'This is a source catalog, not a security certification marketplace. Review and download locally, then import on the Skills page. No remote installation scripts run automatically.'}
        </p>
        <ul>
          <li>
            <a href="https://github.com/anthropics/skills" target="_blank" rel="noreferrer">
              Anthropic Skills
            </a>
          </li>
          <li>
            <a href="https://github.com/openai/skills" target="_blank" rel="noreferrer">
              OpenAI Skills
            </a>
          </li>
          <li>
            <a href="https://github.com/microsoft/playwright-mcp" target="_blank" rel="noreferrer">
              Playwright MCP
            </a>
          </li>
          <li>
            <a href="https://registry.modelcontextprotocol.io" target="_blank" rel="noreferrer">
              MCP Registry
            </a>
          </li>
        </ul>
      </details>
      <details>
        <summary>{zh ? '工具 Hooks · 确定性规则' : 'Tool hooks · deterministic rules'}</summary>
        <p className="muted">
          {zh
            ? '规则可拒绝、记录通知或运行命令。命令继续走现有审批与台账，每次外层工具最多触发 8 个命令。留空项目 ID 表示全局；工具名可填 *。'
            : 'Rules deny, notify or run a command through normal approvals and effects (at most eight hook commands per outer call). Empty project ID applies globally. Tool may be *.'}
        </p>
        {(value.hooks || []).map((h: any, i: number) => (
          <div className="form-grid" key={h.id}>
            <label>
              {zh ? '启用' : 'Enabled'}
              <input
                type="checkbox"
                checked={h.enabled}
                onChange={(e) =>
                  setValue({
                    ...value,
                    hooks: value.hooks.map((v: any, j: number) =>
                      j === i ? { ...v, enabled: e.target.checked } : v,
                    ),
                  })
                }
              />
            </label>
            {['tool', 'message', 'projectId', 'command'].map((k) => (
              <label key={k}>
                {k}
                <input
                  value={h[k] || ''}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      hooks: value.hooks.map((v: any, j: number) =>
                        j === i ? { ...v, [k]: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label>
              {zh ? '时机' : 'Stage'}
              <select
                value={h.stage}
                onChange={(e) =>
                  setValue({
                    ...value,
                    hooks: value.hooks.map((v: any, j: number) =>
                      j === i
                        ? {
                            ...v,
                            stage: e.target.value,
                            action:
                              e.target.value.startsWith('after') ||
                              (v.action === 'command' &&
                                ![
                                  'beforeTool',
                                  'afterTool',
                                  'beforeCommand',
                                  'afterCommand',
                                ].includes(e.target.value))
                                ? 'notify'
                                : v.action,
                          }
                        : v,
                    ),
                  })
                }
              >
                <option value="beforeTool">beforeTool</option>
                <option value="afterTool">afterTool</option>
                <option value="beforeCommand">beforeCommand</option>
                <option value="afterCommand">afterCommand</option>
                <option value="beforeCompaction">beforeCompaction</option>
                <option value="afterCompaction">afterCompaction</option>
                <option value="beforeTaskComplete">beforeTaskComplete</option>
                <option value="afterTaskComplete">afterTaskComplete</option>
                <option value="beforeMemoryWrite">beforeMemoryWrite</option>
                <option value="afterMemoryWrite">afterMemoryWrite</option>
              </select>
            </label>
            <label>
              {zh ? '动作' : 'Action'}
              <select
                value={h.action}
                onChange={(e) =>
                  setValue({
                    ...value,
                    hooks: value.hooks.map((v: any, j: number) =>
                      j === i ? { ...v, action: e.target.value } : v,
                    ),
                  })
                }
              >
                <option value="notify">notify</option>
                {['beforeTool', 'afterTool', 'beforeCommand', 'afterCommand'].includes(h.stage) && (
                  <option value="command">command (approval applies)</option>
                )}
                {h.stage.startsWith('before') && <option value="deny">deny</option>}
              </select>
            </label>
            <button
              onClick={() =>
                setValue({ ...value, hooks: value.hooks.filter((_: any, j: number) => i !== j) })
              }
            >
              {zh ? '删除' : 'Remove'}
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setValue({
              ...value,
              hooks: [
                ...(value.hooks || []),
                {
                  id: crypto.randomUUID(),
                  enabled: false,
                  stage: 'beforeTool',
                  tool: '*',
                  action: 'notify',
                  message: 'Policy observation',
                },
              ],
            })
          }
        >
          {zh ? '添加规则' : 'Add rule'}
        </button>
      </details>
    </section>
  );
}
