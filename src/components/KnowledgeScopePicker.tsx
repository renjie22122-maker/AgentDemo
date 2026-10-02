import { useState } from 'react';
export function KnowledgeScopePicker({ scope, onChange, projects, conversations, zh }: any) {
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('project'),
    [page, setPage] = useState(0),
    [open, setOpen] = useState(false);
  const shared = zh ? '所有普通对话 · 共享知识库' : 'All general chats · shared library';
  const entries = [
    {
      id: 'general',
      title: shared,
      kind: 'shared',
      detail: zh
        ? '现有和新普通对话共用；项目除外'
        : 'Existing and new general chats; excludes projects',
    },
    ...projects
      .filter((p: any) => !p.removedAt)
      .map((p: any) => ({
        id: 'project:' + p.id,
        title: p.name,
        kind: 'project',
        detail: zh ? '项目内共享' : 'Shared within project',
      })),
    ...conversations.map((c: any) => ({
      id: 'session:' + c.id,
      title: c.title,
      kind: 'chat',
      detail:
        (projects.find((p: any) => p.id === c.projectId)?.name ||
          (zh ? '普通对话' : 'General chat')) +
        ' · ' +
        c.id,
    })),
  ];
  const selected = entries.find((e) => e.id === scope);
  const matches = entries.filter(
    (e) =>
      e.kind === kind && (e.title + ' ' + e.detail).toLowerCase().includes(query.toLowerCase()),
  );
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <section className="knowledge-scope-picker">
      <div className="row wrap">
        <strong>{zh ? '资料范围' : 'Library scope'}</strong>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          {selected?.title || (zh ? '选择范围' : 'Choose scope')} ▾
        </button>
        {scope !== 'general' && <button onClick={() => pick('general')}>{shared}</button>}
      </div>
      <p className="muted">
        {scope === 'general'
          ? zh
            ? '只配置一次，开启知识库的普通对话自动使用。不迁移任何私有会话资料。'
            : 'Configure once for general chats with knowledge enabled. Private conversation documents are not moved here.'
          : selected?.detail}
      </p>
      {open && (
        <div className="panel">
          <div className="row wrap">
            {[
              ['shared', zh ? '普通对话共享' : 'Shared'],
              ['project', zh ? '项目' : 'Projects'],
              ['chat', zh ? '单个对话' : 'Individual chats'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={kind === id}
                className={kind === id ? 'primary' : ''}
                onClick={() => {
                  setKind(id);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            aria-label={zh ? '搜索知识库范围' : 'Search library scope'}
            placeholder={
              zh ? '搜索名称、项目或对话 ID…' : 'Search name, project or conversation ID…'
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <div className="knowledge-scope-results">
            {matches.slice(page * 15, page * 15 + 15).map((e) => (
              <button
                key={e.id}
                title={e.title}
                className="knowledge-scope-option"
                aria-pressed={scope === e.id}
                onClick={() => pick(e.id)}
              >
                <strong>{e.title}</strong>
                <small>{e.detail}</small>
              </button>
            ))}
          </div>
          {!matches.length && <p>{zh ? '没有匹配范围' : 'No matching scopes'}</p>}
          <div className="row">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              {zh ? '上一页' : 'Previous'}
            </button>
            <small>
              {matches.length} · {page + 1}/{Math.max(1, Math.ceil(matches.length / 15))}
            </small>
            <button disabled={(page + 1) * 15 >= matches.length} onClick={() => setPage(page + 1)}>
              {zh ? '下一页' : 'Next'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
