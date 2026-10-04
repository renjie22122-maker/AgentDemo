export function ActionRulesPanel({ value, setValue, zh }: any) {
  const update = (index: number, patch: any) =>
    setValue({
      ...value,
      actionRules: (value.actionRules || []).map((r: any, i: number) =>
        i === index ? { ...r, ...patch } : r,
      ),
    });
  return (
    <details>
      <summary>{zh ? '操作规则 · 拒绝或人工确认' : 'Action rules · deny or ask'}</summary>
      <p className="muted">
        {zh
          ? '规则只增加限制，不授予沙箱外权限。拒绝优先；命令为完整字符串匹配。路径规则只覆盖声明路径的文件工具，不限制任意命令内部的文件访问。'
          : 'Rules add restrictions, never grant broader access. Deny wins. Commands match exactly. Path rules cover declared file-tool paths, not arbitrary shell file access.'}
      </p>
      {(value.actionRules || []).map((r: any, i: number) => (
        <div className="panel" key={r.id}>
          <label>
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => update(i, { enabled: e.target.checked })}
            />
            {zh ? '启用' : 'Enabled'}
          </label>
          <div className="row">
            <label>
              {zh ? '工具名称或 *' : 'Tool name or *'}
              <input value={r.tool} onChange={(e) => update(i, { tool: e.target.value })} />
            </label>
            <select value={r.decision} onChange={(e) => update(i, { decision: e.target.value })}>
              <option value="deny">{zh ? '拒绝' : 'Deny'}</option>
              <option value="ask">{zh ? '人工确认' : 'Ask human'}</option>
            </select>
          </div>
          <label>
            {zh ? '项目 ID（空为全部）' : 'Project ID (blank = all)'}
            <input
              value={r.projectId || ''}
              onChange={(e) => update(i, { projectId: e.target.value || undefined })}
            />
          </label>
          <label>
            {zh ? '相对路径 glob（可选）' : 'Relative path glob (optional)'}
            <input
              value={r.pathGlob || ''}
              onChange={(e) => update(i, { pathGlob: e.target.value || undefined })}
            />
          </label>
          <label>
            {zh ? '完整命令（可选）' : 'Exact command (optional)'}
            <input
              value={r.commandEquals || ''}
              onChange={(e) => update(i, { commandEquals: e.target.value || undefined })}
            />
          </label>
          <label>
            {zh ? '原因' : 'Reason'}
            <input value={r.reason} onChange={(e) => update(i, { reason: e.target.value })} />
          </label>
          <button
            onClick={() =>
              setValue({
                ...value,
                actionRules: value.actionRules.filter((_: any, j: number) => i !== j),
              })
            }
          >
            {zh ? '删除规则' : 'Remove rule'}
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          setValue({
            ...value,
            actionRules: [
              ...(value.actionRules || []),
              {
                id: crypto.randomUUID(),
                enabled: false,
                tool: '*',
                decision: 'ask',
                reason: zh ? '用户配置的操作规则' : 'User-configured action rule',
              },
            ],
          })
        }
      >
        {zh ? '添加规则' : 'Add rule'}
      </button>
    </details>
  );
}
