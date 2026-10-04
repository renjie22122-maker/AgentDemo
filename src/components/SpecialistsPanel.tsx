export function SpecialistsPanel({ value, setValue, zh }: any) {
  const update = (index: number, patch: any) =>
    setValue({
      ...value,
      specialists: (value.specialists || []).map((r: any, i: number) =>
        i === index ? { ...r, ...patch } : r,
      ),
    });
  return (
    <details>
      <summary>{zh ? '专业成员配置' : 'Specialist definitions'}</summary>
      <p className="muted">
        {zh
          ? '角色沿用父任务模型。技能与工具名单只限定能力，不授予权限；子级工具集合不能超过父级。'
          : 'Specialists retain the parent model. Skills and tools do not grant permissions; child tool sets cannot exceed the parent set.'}
      </p>
      {(value.specialists || []).map((r: any, i: number) => (
        <div className="panel" key={r.id}>
          <label>
            {zh ? '名称' : 'Name'}
            <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
          </label>
          <label>
            {zh ? '角色指引' : 'Instructions'}
            <textarea
              value={r.instructions}
              onChange={(e) => update(i, { instructions: e.target.value })}
            />
          </label>
          <label>
            {zh
              ? '允许的工具（逗号分隔，精确名称）'
              : 'Allowed tools (comma-separated exact names)'}
            <input
              value={r.allowedTools.join(', ')}
              onChange={(e) =>
                update(i, {
                  allowedTools: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            {zh ? '技能 ID（逗号分隔）' : 'Skill IDs (comma-separated)'}
            <input
              value={r.skillIds.join(', ')}
              onChange={(e) =>
                update(i, {
                  skillIds: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              setValue({
                ...value,
                specialists: value.specialists.filter((_: any, j: number) => i !== j),
              })
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
            specialists: [
              ...(value.specialists || []),
              {
                id: crypto.randomUUID(),
                name: zh ? '只读审阅者' : 'Read-only reviewer',
                instructions: zh
                  ? '检查指定材料并报告有证据的问题。'
                  : 'Inspect assigned material and report evidence-backed findings.',
                skillIds: [],
                allowedTools: [
                  'read_file',
                  'read_json',
                  'list_files',
                  'glob',
                  'grep',
                  'search_tools',
                ],
              },
            ],
          })
        }
      >
        {zh ? '添加专业成员' : 'Add specialist'}
      </button>
    </details>
  );
}
