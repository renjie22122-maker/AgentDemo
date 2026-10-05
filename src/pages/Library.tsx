import { MemoryList } from '../components/MemoryList';
import { SkillPackagesPanel } from '../components/SkillPackagesPanel';
import { KnowledgeScopePicker } from '../components/KnowledgeScopePicker';
import { libraryConversations } from '../library-scopes';
import { MemoryDefaults } from '../components/MemoryDefaults';
import { KnowledgeAutomation } from '../components/KnowledgeAutomation';
import { MemoryWorkbench, DocumentVersion } from '../components/MemoryWorkbench';
import { SkillClassificationPanel } from '../components/SkillClassificationPanel';
import { SkillPicker } from '../components/SkillPicker';
import { FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { api } from '../api';
export function Library({ page, state, selected, t, refresh, notify }: any) {
  const selectable = libraryConversations(state.conversations, state.runs);
  const current = selectable.find((c: any) => c.id === selected);
  const [scope, setScope] = useState(
    page === 'memories' || page === 'memory'
      ? state.conversations.find((c: any) => c.id === selected)?.projectId
        ? 'project:' + state.conversations.find((c: any) => c.id === selected).projectId
        : 'user'
      : current
        ? current.projectId
          ? 'project:' + current.projectId
          : 'general'
        : 'general',
  );
  const [text, setText] = useState(''),
    [name, setName] = useState(''),
    [results, setResults] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setResults([]);
  }, [scope]);
  const [knowledgeDate, setKnowledgeDate] = useState('');
  const [indexStatuses, setIndexStatuses] = useState<any>({});
  const file = useRef<HTMLInputElement>(null);
  const go = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div className="eyebrow">{t('YOUR CONTEXT')}</div>
        <h1>{t(page)}</h1>
        <p>{t(page + 'Help')}</p>
      </div>
      {page === 'skills' ? (
        <>
          <section className="panel">
            <label>
              {t('Skill folder')}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="D:\\Skills"
              />
            </label>
            <button
              className="primary"
              disabled={busy || !name}
              onClick={() =>
                go(async () => {
                  const added = await api('/skills/import', { path: name });
                  notify('Imported ' + added.length + ' skills');
                })
              }
            >
              <Plus size={16} />
              {t('import')}
            </button>
          </section>
          <SkillPackagesPanel zh={t('settings') !== 'Settings'} refresh={refresh} notify={notify} />
          <SkillClassificationPanel
            state={state}
            refresh={refresh}
            notify={notify}
            zh={t('settings') !== 'Settings'}
          />
          <SkillPicker
            skills={state.skills}
            selected={[]}
            zh={t('settings') !== 'Settings'}
            disabled={busy}
            onDelete={(id) => void go(() => api('/skills/' + id, undefined, 'DELETE'))}
          />
        </>
      ) : page === 'knowledge' ? (
        <>
          <section className="panel">
            <KnowledgeScopePicker
              scope={scope}
              onChange={setScope}
              projects={state.projects}
              conversations={selectable}
              zh={t('settings') !== 'Settings'}
            />
            <div className="row wrap">
              <button disabled={!scope || busy} onClick={() => file.current?.click()}>
                <Upload size={16} />
                {t('import')} · PDF, DOCX, XLSX, CSV, text
              </button>
              <input
                ref={file}
                hidden
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void go(async () => {
                      const form = new FormData();
                      form.append('file', f);
                      await api('/upload?scope=' + encodeURIComponent(scope), form);
                      notify('Document indexed');
                    });
                  e.target.value = '';
                }}
              />
            </div>
            <KnowledgeAutomation
              key={scope}
              onStatus={setIndexStatuses}
              scope={scope}
              project={state.projects.find((p: any) => scope === 'project:' + p.id)}
              embedding={state.settings.embedding}
              profile={state.settings.profiles.find(
                (p: any) => p.id === state.settings.defaultProfileId,
              )}
              zh={t('settings') !== 'Settings'}
              notify={notify}
            />
            <details>
              <summary>{t('Paste a document')}</summary>
              <input
                placeholder={t('Document name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('Document text…')}
              />
              <button
                disabled={!scope || !text || !name || busy}
                onClick={() =>
                  go(async () => {
                    await api('/knowledge/text', { scope, name, text });
                    setText('');
                  })
                }
              >
                {t('import')}
              </button>
            </details>
            <div className="row">
              <input
                placeholder={t('Test retrieval…')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                disabled={!scope || !text}
                onClick={() =>
                  go(async () =>
                    setResults(
                      await api('/knowledge/search', {
                        scope,
                        query: text,
                        asOf: knowledgeDate ? Date.parse(knowledgeDate + 'Z') : undefined,
                      }),
                    ),
                  )
                }
              >
                <Search size={16} />
              </button>
            </div>
            <label>
              {t('settings') === 'Settings'
                ? 'As of (UTC, blank for current)'
                : '历史时点（UTC，留空查当前）'}
              <input
                type="datetime-local"
                value={knowledgeDate}
                onChange={(e) => setKnowledgeDate(e.target.value)}
              />
            </label>
            {results.map((r) => (
              <div className="search-result" key={r.id}>
                <strong>
                  {r.name} · v{r.version || 1} · chunk {r.ordinal}
                </strong>
                <p>{r.text}</p>
                <small>
                  {r.source} · {r.documentId} · {r.id}
                </small>
              </div>
            ))}
          </section>
          {state.documents
            .filter((d: any) => !scope || d.scope === scope)
            .map((d: any) => (
              <article className="panel row" key={d.id}>
                <button
                  disabled={!text || !scope}
                  onClick={() =>
                    go(() => api('/knowledge/feedback', { scope, query: text, documentId: d.id }))
                  }
                >
                  {t('settings') === 'Settings'
                    ? 'Correct source for this query'
                    : '标记为当前查询的正确来源'}
                </button>
                <FileText size={20} />
                <div className="grow">
                  <strong>{d.name}</strong>
                  <p className="muted">
                    {d.characters.toLocaleString()} characters · {d.scope}
                  </p>
                  <DocumentVersion document={d} go={go} zh={t('settings') !== 'Settings'} />
                </div>
                {(state.settings.embedding.backend === 'local' ||
                  state.settings.embedding.model) && (
                  <button
                    disabled={busy || indexStatuses[d.id]?.status === 'indexed'}
                    onClick={() =>
                      go(async () => {
                        const r = await api('/knowledge/' + d.id + '/index', {});
                        notify('Indexed ' + r.chunks + ' chunks');
                      })
                    }
                  >
                    {indexStatuses[d.id]?.status === 'indexed'
                      ? t('settings') === 'Settings'
                        ? 'Vectors ready'
                        : '已建立向量索引'
                      : t('settings') === 'Settings'
                        ? 'Index pending vectors'
                        : '补齐待处理向量'}
                    {indexStatuses[d.id] &&
                      ` · ${indexStatuses[d.id].completed}/${indexStatuses[d.id].total}`}
                  </button>
                )}
                <button onClick={() => go(() => api('/knowledge/' + d.id, undefined, 'DELETE'))}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
        </>
      ) : (
        <>
          <section className="panel">
            <div className="form-grid">
              <label>
                {t('scope')}
                <select
                  value={scope.startsWith('project:') ? scope : 'user'}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="user">
                    {t('settings') === 'Settings'
                      ? 'General chats · user preferences'
                      : '普通对话 · 用户偏好'}
                  </option>
                  {state.projects.map((p: any) => (
                    <option key={p.id} value={'project:' + p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                t('settings') === 'Settings'
                  ? 'Optional: add a preference manually. You can also ask the agent to remember it.'
                  : '可选：手工添加偏好。也可在聊天里说“记住这个偏好”，由 Agent 提出候选。'
              }
            />
            <button
              className="primary"
              disabled={!text || busy}
              onClick={() =>
                go(async () => {
                  await api('/memories', {
                    scope: scope.startsWith('project:') ? scope : 'user',
                    content: text,
                  });
                  setText('');
                })
              }
            >
              <Plus size={16} />
              {t('create')}
            </button>
          </section>
          <MemoryDefaults
            scope={scope.startsWith('project:') ? scope : 'user'}
            state={state}
            zh={t('settings') !== 'Settings'}
            notify={notify}
          />
          <button
            disabled={busy}
            onClick={() =>
              go(() =>
                api('/memories/index', { scope: scope.startsWith('project:') ? scope : 'user' }),
              )
            }
          >
            {state.settings.embedding.backend === 'local'
              ? t('settings') !== 'Settings'
                ? '本地索引当前范围的有效记忆'
                : 'Index active memories locally'
              : t('settings') !== 'Settings'
                ? '为当前范围的有效记忆建立索引（发送到已配置的 embedding 服务）'
                : 'Index active memories with the configured embedding API'}
          </button>
          <p className="muted">
            {t('settings') === 'Settings'
              ? 'Enable Automatic memory management in conversation details. Sourced facts are maintained automatically; uncertain conflicts are quarantined. Local embedding indexes learned active memories automatically. Documents belong in Knowledge.'
              : '在对话详情开启“自动管理记忆”，后台整理有来源的事实，不确定冲突自动隔离。本地 embedding 会自动索引新学习的有效记忆；原始文档请放入知识库。'}
          </p>
          <details>
            <summary>
              {t('settings') === 'Settings' ? 'Background memory activity' : '后台记忆处理记录'}
            </summary>
            {(state.memoryLearning || [])
              .filter((j: any) => j.scope === (scope.startsWith('project:') ? scope : 'user'))
              .map((j: any) => (
                <p key={j.id}>
                  {new Date(j.at).toLocaleString()} · {j.status} · {j.added || 0}{' '}
                  {t('settings') === 'Settings' ? 'added' : '新增'} · {j.candidates || 0}{' '}
                  {t('settings') === 'Settings' ? 'candidates' : '待确认'} {j.reason || ''}
                </p>
              ))}
          </details>
          <MemoryWorkbench
            memories={state.memories}
            conversations={state.conversations}
            key={scope}
            scope={scope.startsWith('project:') ? scope : 'user'}
            go={go}
            zh={t('settings') !== 'Settings'}
          />
          <MemoryList
            key={scope}
            memories={state.memories}
            conversations={state.conversations}
            scope={scope.startsWith('project:') ? scope : 'user'}
            zh={t('settings') !== 'Settings'}
            go={go}
          />
        </>
      )}
    </div>
  );
}
