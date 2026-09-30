import { BookOpen, FileText, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api';
export function Library({ page, state, selected, t, refresh, notify }: any) {
  const [scope, setScope] = useState(
    selected ? 'session:' + selected : state.projects[0] ? 'project:' + state.projects[0].id : '',
  );
  const [text, setText] = useState(''),
    [name, setName] = useState(''),
    [results, setResults] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
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
  const scopes = (
    <>
      <option value="">{t('Choose a scope')}</option>
      {state.projects.map((p: any) => (
        <option key={p.id} value={'project:' + p.id}>
          {t('projects')} · {p.name}
        </option>
      ))}
      {state.conversations
        .filter((c: any) => !c.archived)
        .map((c: any) => (
          <option key={c.id} value={'session:' + c.id}>
            {c.title}
          </option>
        ))}
    </>
  );
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
          <div className="cards">
            {state.skills.map((s: any) => (
              <article className="panel" key={s.id}>
                <div className="section-title">
                  <h3>
                    <BookOpen size={18} />
                    {s.name}
                  </h3>
                  <button
                    title={t('delete')}
                    onClick={() => go(() => api('/skills/' + s.id, undefined, 'DELETE'))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p>{s.description}</p>
                <small className="muted">{s.id.slice(0, 8)}</small>
              </article>
            ))}
          </div>
        </>
      ) : page === 'knowledge' ? (
        <>
          <section className="panel">
            <label>
              {t('scope')}
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {scopes}
              </select>
            </label>
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
                  go(async () => setResults(await api('/knowledge/search', { scope, query: text })))
                }
              >
                <Search size={16} />
              </button>
            </div>
            {results.map((r) => (
              <div className="search-result" key={r.id}>
                <strong>
                  {r.name} · chunk {r.ordinal}
                </strong>
                <p>{r.text}</p>
              </div>
            ))}
          </section>
          {state.documents
            .filter((d: any) => !scope || d.scope === scope)
            .map((d: any) => (
              <article className="panel row" key={d.id}>
                <FileText size={20} />
                <div className="grow">
                  <strong>{d.name}</strong>
                  <p className="muted">
                    {d.characters.toLocaleString()} characters · {d.scope}
                  </p>
                </div>
                {state.settings.embedding.model && (
                  <button
                    onClick={() =>
                      go(async () => {
                        const r = await api('/knowledge/' + d.id + '/index', {});
                        notify('Indexed ' + r.chunks + ' chunks');
                      })
                    }
                  >
                    {t('Index vectors')}
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
                  <option value="user">{t('User · all chats')}</option>
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
              placeholder={t('Preference or verified fact…')}
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
          <button disabled={busy} onClick={() => go(() => api('/memories/index', {}))}>
            {t('settings') !== 'Settings'
              ? '为已确认记忆建立语义索引（发送到已配置的 embedding 服务）'
              : 'Index confirmed memories (sends them to the configured embedding service)'}
          </button>
          {state.memories.map((m: any) => (
            <article className="panel" key={m.id}>
              <div className="section-title">
                <span className={'pill ' + (m.active ? 'success' : '')}>
                  {m.active ? 'Active' : 'Needs confirmation'}
                </span>
                <div className="row">
                  <button
                    onClick={() =>
                      go(() => api('/memories/' + m.id, { active: !m.active }, 'PATCH'))
                    }
                  >
                    {m.active ? 'Deactivate' : 'Confirm'}
                  </button>
                  <button onClick={() => go(() => api('/memories/' + m.id, undefined, 'DELETE'))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p>{m.content}</p>
              <small className="muted">
                {m.scope} · {m.source} · rev {m.revision}
              </small>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
