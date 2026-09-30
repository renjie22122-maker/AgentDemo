import { ConversationStatus } from './components/ConversationStatus';
import { DisplaySettings } from './components/DisplaySettings';
import { connectLive } from './live';
import { Attention } from './components/Attention';
import { Elapsed } from './components/Elapsed';
import { DiffGroup } from './components/Diff';
import {
  BookOpen,
  Folder,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Pin,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, Conversation } from '../shared/types';
import { api, bootstrap } from './api';
import { Composer } from './components/Composer';
import { Inspector } from './components/Inspector';
import { Markdown } from './components/Markdown';
import { Activity, InputCard, Message } from './components/Message';
import { ProjectDialog } from './components/ProjectDialog';
import { Sidebar } from './components/Sidebar';
import { translator, type Language } from './i18n';
import { Library } from './pages/Library';
import { SettingsPage } from './pages/Settings';
import type { ConversationDetail, UiState } from './types';
const ended = (s: string) => ['completed', 'failed', 'interrupted'].includes(s);
export function App() {
  const [state, setState] = useState<UiState | null>(null),
    [selected, setSelected] = useState<string | null>(() => localStorage.getItem('agentdemo.chat')),
    [detail, setDetail] = useState<ConversationDetail | null>(null),
    [page, setPage] = useState('chat');
  const [language, setLanguage] = useState<Language>(
      () => (localStorage.getItem('agentdemo.language') as Language) || 'en',
    ),
    [theme, setTheme] = useState(() => localStorage.getItem('agentdemo.theme') || 'dark');
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
    [inspector, setInspector] = useState(false),
    [inspectorTab, setInspectorTab] = useState<'settings' | 'context' | 'files'>('settings'),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [draft, setDraft] = useState(''),
    [toast, setToast] = useState(''),
    [sending, setSending] = useState(false),
    [streams, setStreams] = useState<Record<string, any>>({});
  const [projectDialog, setProjectDialog] = useState(false),
    [projectName, setProjectName] = useState(''),
    [projectFolders, setProjectFolders] = useState(''),
    [menu, setMenu] = useState<string | null>(null),
    [drag, setDrag] = useState(false);
  const [connection, setConnection] = useState('Connecting');
  const reconnect = useRef<() => void>(() => {});
  const [anchor, setAnchor] = useState('');
  const jump = useCallback((conversation: string, input: string) => {
    stick.current = false;
    setPage('chat');
    setSelected(conversation);
    setAnchor('input-' + input);
  }, []);
  useEffect(() => {
    if (!anchor) return;
    const target = document.getElementById(anchor);
    if (target) {
      stick.current = false;
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
      setAnchor('');
    }
  }, [anchor, detail]);
  const finishedMessages = useRef(new Set<string>());
  const selectedRef = useRef(selected),
    scroll = useRef<HTMLDivElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    stick = useRef(true),
    upload = useRef<HTMLInputElement>(null),
    draftRef = useRef<HTMLTextAreaElement>(null);
  const t = translator(language);
  const notify = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(''), 6500);
  }, []);
  const refresh = useCallback(async () => {
    const value = await api('/state');
    setState(value);
    return value;
  }, []);
  const load = useCallback(async (id: string) => {
    const value = await api('/conversations/' + id);
    if (selectedRef.current === id) {
      setDetail((old: any) => ({
        ...value,
        events: [
          ...value.events,
          ...(old?.conversation.id === id
            ? old.events.filter((e: any) => !value.events.some((v: any) => v.id === e.id))
            : []),
        ].sort((a: any, b: any) => a.id - b.id),
      }));
      setStreams((old) =>
        Object.fromEntries(
          value.streams
            .filter((s: any) => !finishedMessages.current.has(s.messageId))
            .map((s: any) => [
              s.runId,
              old[s.runId]?.messageId === s.messageId && old[s.runId].text.length > s.text.length
                ? old[s.runId]
                : s,
            ]),
        ),
      );
    }
  }, []);
  useEffect(() => {
    selectedRef.current = selected;
    localStorage.setItem('agentdemo.chat', selected || '');
    setDetail(null);
    setStreams({});
    stick.current = !anchor;
    setDraft(localStorage.getItem('agentdemo.draft.' + selected) || '');
    if (selected) void load(selected).catch((e) => notify(e.message));
  }, [selected, load, notify]);
  useEffect(() => {
    localStorage.setItem('agentdemo.draft.' + selected, draft);
  }, [draft, selected]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('agentdemo.theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    localStorage.setItem('agentdemo.language', language);
  }, [language]);
  useEffect(() => {
    const live = connectLive(
      '/api/events',
      {
        agent: (event) => {
          const e = JSON.parse((event as MessageEvent).data) as AgentEvent;
          if (e.conversationId === selectedRef.current) {
            setDetail((d: any) =>
              d
                ? {
                    ...d,
                    events: d.events.some((x: AgentEvent) => x.id === e.id)
                      ? d.events
                      : [...d.events, e],
                  }
                : d,
            );
            if (e.type === 'assistant.message') {
              finishedMessages.current.add(e.data.messageId);
              setStreams((s) => {
                const copy = { ...s };
                delete copy[e.runId!];
                return copy;
              });
            }
            if (
              ['input.requested', 'input.answered', 'run.status', 'attachment.added'].includes(
                e.type,
              )
            )
              void load(e.conversationId).catch(() => {});
          }
          if (
            [
              'input.requested',
              'input.answered',
              'run.status',
              'usage',
              'child.started',
              'user.message',
            ].includes(e.type)
          )
            void refresh().catch(() => {});
        },
        delta: (event) => {
          const e = JSON.parse((event as MessageEvent).data);
          if (e.conversationId === selectedRef.current)
            setStreams((s) => ({
              ...s,
              [e.runId]: {
                ...e,
                text: (s[e.runId]?.messageId === e.messageId ? s[e.runId].text : '') + e.text,
              },
            }));
        },
        heartbeat: () => {
          void refresh().catch(() => {});
        },
        ready: () => {
          void refresh().catch((e) => notify(e.message));
          if (selectedRef.current) void load(selectedRef.current).catch((e) => notify(e.message));
        },
      },
      setConnection,
      async () => {
        await bootstrap();
        await refresh();
      },
    );
    reconnect.current = live.retry;
    return () => live.close();
  }, [refresh, load, notify]);
  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ behavior: 'instant' });
  }, [detail?.events.length, streams, selected]);
  async function action(fn: () => Promise<any>) {
    try {
      return await fn();
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function newChat(projectId: string | null = null) {
    const c = await api('/conversations', { projectId });
    setSelected(c.id);
    setPage('chat');
    await refresh();
    return c.id;
  }
  const conversation = detail?.conversation as Conversation | undefined;
  const currentRuns = state?.runs.filter((r: any) => r.conversationId === selected) || [],
    run = currentRuns.at(-1),
    running = run && !ended(run.status);
  const descendants =
    state && run
      ? state.runs.filter((candidate) => {
          let r: typeof candidate | undefined = candidate;
          while (r) {
            if (r.id === run.id) return true;
            r = r.parentRunId ? state.runs.find((p) => p.id === r!.parentRunId) : undefined;
          }
          return false;
        })
      : [];
  const totalUsage = run
    ? {
        ...run,
        usageComplete: !descendants.some((r) => r.usageComplete === false),
        inputTokens: descendants.reduce((n, r) => n + r.inputTokens, 0),
        outputTokens: descendants.reduce((n, r) => n + r.outputTokens, 0),
        cachedTokens: descendants.reduce((n, r) => n + r.cachedTokens, 0),
        modelCalls: descendants.reduce((n, r) => n + r.modelCalls, 0),
        estimatedUsd: descendants.some((r) => r.estimatedUsd === null)
          ? null
          : descendants.reduce((n, r) => n + (r.estimatedUsd || 0), 0),
      }
    : undefined;
  const project = state?.projects.find((p: any) => p.id === conversation?.projectId),
    profile = state?.settings.profiles.find((p: any) => p.id === conversation?.profileId);
  const update = async (data: any) => {
    if (!selected) return;
    await api('/conversations/' + selected, data, 'PATCH');
    await load(selected);
    await refresh();
  };
  async function send(text = draft) {
    if (!text.trim()) return;
    setSending(true);
    try {
      const key = selected || (await newChat());
      await api('/conversations/' + key + '/message', { text });
      setDraft('');
      localStorage.removeItem('agentdemo.draft.' + key);
      stick.current = true;
      await refresh();
      await load(key);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSending(false);
    }
  }
  async function addFiles(files: FileList | File[]) {
    const key = selected || (await newChat());
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      await api('/upload?conversationId=' + key, form);
    }
    await load(key);
    notify(t('attachments') + ' ✓');
  }
  function chatLink(c: any) {
    const active = state!.runs.some((r: any) => r.conversationId === c.id && !ended(r.status));
    return (
      <div
        key={c.id}
        className={'chat-link ' + (selected === c.id && page === 'chat' ? 'active' : '')}
      >
        <button
          className="chat-select"
          onClick={() => {
            setSelected(c.id);
            setPage('chat');
            setMenu(null);
          }}
        >
          {active ? (
            <span className="working-dot" />
          ) : c.parentId ? (
            <GitBranch size={14} />
          ) : (
            <MessageSquare size={14} />
          )}
          <span>{c.title}</span>
          {c.pinned && <Pin size={12} />}
        </button>
        <button
          className="chat-more"
          aria-label={'Chat actions ' + c.title}
          onClick={() => setMenu(menu === c.id ? null : c.id)}
        >
          <MoreHorizontal size={15} />
        </button>
        {menu === c.id && (
          <div className="context-menu">
            {[
              [
                t('rename'),
                async () => {
                  const title = prompt(t('name'), c.title);
                  if (title) await api('/conversations/' + c.id, { title }, 'PATCH');
                },
              ],
              [t('pin'), () => api('/conversations/' + c.id, { pinned: !c.pinned }, 'PATCH')],
              [
                c.archived ? t('restore') : t('archive'),
                () => api('/conversations/' + c.id, { archived: !c.archived }, 'PATCH'),
              ],
            ].map(([label, fn]: any) => (
              <button
                key={label}
                onClick={() =>
                  void action(async () => {
                    await fn();
                    setMenu(null);
                    await refresh();
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const filtered =
    state?.conversations.filter(
      (c: any) => c.archived === archived && c.title.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  function timeline() {
    const nodes: any[] = [];
    const shownChanges = new Set<string>();
    let activity: AgentEvent[] = [];
    const flush = () => {
      if (activity.length) {
        nodes.push(<Activity key={'steps-' + activity[0].id} events={activity} t={t} />);
        activity = [];
      }
    };
    for (const e of detail?.events || []) {
      if (e.type === 'user.message' || e.type === 'assistant.message') {
        flush();
        nodes.push(
          <Message
            key={e.id}
            event={e}
            t={t}
            notify={notify}
            onBranch={(eventId) =>
              void action(async () => {
                const fork = await api('/conversations/' + selected + '/fork', { eventId });
                setSelected(fork.id);
                await refresh();
                notify('Conversation branched. Project files are shared.');
              })
            }
          />,
        );
        if (e.type === 'user.message' && !e.data.steering) {
          const timing = currentRuns.find((r) => r.id === e.runId);
          if (timing)
            nodes.push(<Elapsed key={'elapsed-' + e.id} run={timing} zh={language === 'zh'} />);
        }
      } else if (e.type === 'file.changes-limited' || e.type === 'file.changed') {
        const key = e.runId || 'legacy';
        if (!shownChanges.has(key)) {
          flush();
          shownChanges.add(key);
          const changes = (detail?.events || []).filter(
            (x: AgentEvent) =>
              (x.runId || 'legacy') === key &&
              ['file.changed', 'file.changes-limited'].includes(x.type),
          );
          nodes.push(<DiffGroup key={'changes-' + key} events={changes} zh={language === 'zh'} />);
        }
      } else if (e.type === 'input.requested') {
        flush();
        const input = detail?.inputs.find((q: any) => q.id === e.data.id) || e.data;
        nodes.push(
          <InputCard
            key={e.id}
            input={input}
            t={t}
            notify={notify}
            refresh={() => load(selected!)}
          />,
        );
      } else if (
        [
          'tool.started',
          'tool.completed',
          'model.started',
          'context.compacting',
          'context.compacted',
          'child.started',
        ].includes(e.type)
      )
        activity.push(e);
      else if (e.type === 'run.status' && e.data.error) {
        flush();
        nodes.push(
          <div key={e.id} className="notice error">
            {e.data.error}
          </div>,
        );
      }
    }
    flush();
    return nodes;
  }
  if (!state)
    return (
      <div className="loading">
        <Sparkles size={30} />
        <p>Opening AgentDemo…</p>
        {toast && <p>{toast}</p>}
      </div>
    );
  return (
    <div className={'app ' + (!sidebar ? 'no-sidebar' : '')}>
      <div className="live-toolbar">
        <DisplaySettings zh={language === 'zh'} />
        <span role="status">
          {language === 'zh'
            ? { Connected: '已连接', Connecting: '连接中' }[connection] || connection
            : connection}
        </span>
        {connection !== 'Connected' && (
          <button onClick={() => reconnect.current()}>
            {language === 'zh' ? '重新连接' : 'Reconnect'}
          </button>
        )}
        <Attention
          items={(state as any).pendingInputs || []}
          onSelect={jump}
          zh={language === 'zh'}
        />
      </div>
      {sidebar && (
        <Sidebar
          {...{
            t,
            state,
            setSidebar,
            action,
            newChat,
            query,
            setQuery,
            setProjectDialog,
            archived,
            setArchived,
            filtered,
            chatLink,
            page,
            setPage,
            language,
            setLanguage,
            theme,
            setTheme,
          }}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="row minzero">
            {!sidebar && (
              <button className="icon" onClick={() => setSidebar(true)}>
                <PanelLeft size={18} />
              </button>
            )}
            <span className="breadcrumb">
              {page === 'chat' ? project?.name || t('general') : t(page)}
            </span>
            <span className="slash">/</span>
            <strong className="truncate">
              {page === 'chat' ? conversation?.title || t('newChat') : 'AgentDemo'}
            </strong>
          </div>
          {page === 'chat' && (
            <div className="row">
              <select
                className="jump-select"
                aria-label="Jump to turn"
                defaultValue=""
                onChange={(e) => {
                  stick.current = false;
                  document
                    .getElementById('event-' + e.target.value)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <option value="">↳ Turns</option>
                {detail?.events
                  .filter((e: any) => e.type === 'user.message')
                  .map((e: any, i: number) => (
                    <option key={e.id} value={e.id}>
                      {i + 1} · {e.data.text.slice(0, 32)}
                    </option>
                  ))}
              </select>
              <button
                className={'icon ' + (inspector ? 'selected' : '')}
                title={t('details')}
                onClick={() => setInspector(!inspector)}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          )}
        </header>
        {page === 'chat' && conversation && (
          <ConversationStatus
            id={conversation.id}
            live={!!running}
            status={run?.status || 'ready'}
            project={project}
            isolated={!!conversation.isolationId}
            zh={language === 'zh'}
            open={(tab) => {
              setInspectorTab(tab);
              setInspector(true);
            }}
          />
        )}
        {page === 'settings' ? (
          <div className="page-scroll">
            <SettingsPage settings={state.settings} t={t} refresh={refresh} notify={notify} />
          </div>
        ) : page !== 'chat' ? (
          <div className="page-scroll">
            <Library
              page={page}
              state={state}
              selected={selected}
              t={t}
              refresh={refresh}
              notify={notify}
            />
          </div>
        ) : (
          <div className="chat-layout">
            <div className="chat-main">
              <div
                className="conversation-scroll"
                ref={scroll}
                onScroll={() => {
                  const el = scroll.current!;
                  stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 130;
                }}
              >
                <div className="conversation-width">
                  {!detail?.events.length ? (
                    <section className="welcome">
                      <div className="welcome-icon">
                        <Sparkles size={32} />
                      </div>
                      <div className="eyebrow">{t('A LITTLE SPACE FOR BIG IDEAS')}</div>
                      <h1>{t('welcome')}</h1>
                      <p>{t('welcomeSub')}</p>
                      <div className="suggestions">
                        {[
                          [Folder, 'Explore a project', 'Understand code, plan a change'],
                          [BookOpen, 'Work with documents', 'Find answers grounded in sources'],
                          [Sparkles, 'Start with a question', 'Think through something together'],
                        ].map(([Icon, title, sub]: any) => (
                          <button
                            key={title}
                            onClick={() => {
                              setDraft(
                                title === 'Explore a project'
                                  ? 'Help me understand this project.'
                                  : title === 'Work with documents'
                                    ? 'Help me analyze the documents I attach.'
                                    : 'Help me think through an idea.',
                              );
                              draftRef.current?.focus();
                            }}
                          >
                            <Icon size={19} />
                            <strong>{t(title)}</strong>
                            <span>{t(sub)}</span>
                          </button>
                        ))}
                      </div>
                      {!state.settings.profiles.length && (
                        <button className="primary" onClick={() => setPage('settings')}>
                          {t('noModel')}
                        </button>
                      )}
                    </section>
                  ) : (
                    timeline()
                  )}
                  {Object.entries(streams).map(
                    ([key, s]: any) =>
                      s.text && (
                        <article className="message assistant streaming" key={key}>
                          <div className="message-heading">
                            <span className="avatar">
                              <Sparkles size={15} />
                            </span>
                            <strong>{t('AgentDemo')}</strong>
                            <span className="working-dot" />
                          </div>
                          <div className="message-body">
                            <Markdown text={s.text} />
                          </div>
                        </article>
                      ),
                  )}
                  {run &&
                    state.runs
                      .filter((child) => child.parentRunId === run.id)
                      .map((child) => (
                        <div className="notice" key={child.id}>
                          <button onClick={() => setSelected(child.conversationId)}>
                            {state.conversations.find((c) => c.id === child.conversationId)
                              ?.title || 'Subagent'}{' '}
                            <span className="pill">{child.status.replaceAll('_', ' ')}</span>
                          </button>
                        </div>
                      ))}
                  {detail?.teamSpace && (
                    <details className="notice">
                      <summary>
                        {language === 'zh' ? '团队运行状态' : 'Team lifecycle'} ·{' '}
                        {detail.teamSpace.mode} · {detail.teamSpace.status}
                      </summary>
                      {detail.teamSpace.status === 'active' && (
                        <button
                          onClick={() =>
                            void action(() =>
                              api('/runs/' + detail.teamSpace!.id + '/stop-team', {}),
                            )
                          }
                        >
                          {language === 'zh' ? '停止整个团队' : 'Stop entire team'}
                        </button>
                      )}
                      <p>
                        {language === 'zh'
                          ? '单个成员结束不代表团队完成。'
                          : 'An individual final answer does not complete the team.'}
                      </p>
                      {Object.entries(detail.teamSpace.roles).map(([role, member]) => (
                        <div key={role}>
                          {role}: {member}
                          <select
                            aria-label={'Transfer ' + role}
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                void action(() =>
                                  api('/runs/' + detail.teamSpace!.id + '/team-role', {
                                    role,
                                    targetRunId: e.target.value,
                                    revision: detail.teamSpace!.revision,
                                  }),
                                );
                            }}
                          >
                            <option value="">
                              {language === 'zh' ? '交接角色…' : 'Transfer role…'}
                            </option>
                            {detail.teamMembers
                              ?.filter(
                                (m) =>
                                  !['completed', 'failed', 'interrupted'].includes(m.status) &&
                                  !detail.teamSpace!.closed[m.runId],
                              )
                              .map((m) => (
                                <option key={m.runId} value={m.runId}>
                                  {m.runId}
                                </option>
                              ))}
                          </select>
                        </div>
                      ))}
                      {detail.teamSpace.mode === 'creative' && (
                        <p>
                          {language === 'zh'
                            ? '每成员讨论消息上限：'
                            : 'Discussion message limit per member: '}
                          {detail.teamSpace.maxMessages}
                        </p>
                      )}
                      {detail.teamSpace.blockers.map((b) => (
                        <p key={b}>{b}</p>
                      ))}
                      {detail.teamSpace.messages.map((m) => (
                        <details key={m.id}>
                          <summary>
                            {m.sender} · {m.text.slice(0, 80)}
                          </summary>
                          <p>{m.text}</p>
                        </details>
                      ))}
                    </details>
                  )}
                  {!!detail?.teamMembers && detail.teamMembers.length > 1 && (
                    <details className="notice">
                      <summary>
                        {language === 'zh' ? '团队成员' : 'Team members'} ·{' '}
                        {detail.teamMembers.length}
                      </summary>
                      {detail.teamScheduling?.enabled && (
                        <p>
                          {language === 'zh'
                            ? '自动分配已开启 · 每成员加权容量：'
                            : 'Automatic assignment · weighted capacity per worker: '}
                          {detail.teamScheduling.maxLoad}
                        </p>
                      )}
                      {detail.teamMembers.map((member) => (
                        <div className="notice" key={member.runId}>
                          <strong>{member.role}</strong> · {member.status}
                          <button
                            onClick={() => {
                              const target = state.runs.find((r) => r.id === member.runId);
                              if (target) setSelected(target.conversationId);
                            }}
                          >
                            {state.conversations.find(
                              (c) =>
                                c.id ===
                                state.runs.find((r) => r.id === member.runId)?.conversationId,
                            )?.title || member.runId}
                          </button>
                          <small>
                            {detail.teamScheduling?.workers.includes(member.runId) && (
                              <span>
                                {language === 'zh' ? '任务负载' : 'Task load'}:{' '}
                                {detail.taskBoard?.tasks
                                  .filter(
                                    (t) =>
                                      t.owner === member.runId &&
                                      ['running', 'blocked'].includes(t.status),
                                  )
                                  .reduce((n, t) => n + (t.weight || 1), 0) ?? 0}
                                /{detail.teamScheduling.maxLoad} ·{' '}
                              </span>
                            )}
                            {member.tasks.join(', ') || '—'} ·{' '}
                            {language === 'zh' ? '待核对操作' : 'Unresolved effects'}:{' '}
                            {member.unresolvedEffects}
                          </small>
                        </div>
                      ))}
                    </details>
                  )}
                  {!!detail?.taskBoard?.tasks?.length && (
                    <details className="notice">
                      <summary>
                        {language === 'zh'
                          ? '任务计划（执行者记录）'
                          : 'Task plan (author-reported)'}{' '}
                        · {detail.taskBoard.tasks.filter((t: any) => t.status === 'done').length}/
                        {detail.taskBoard.tasks.length}
                      </summary>
                      {detail.taskBoard.tasks.map((task: any) => (
                        <div className="notice" key={task.id}>
                          <strong>{task.title}</strong> <span className="pill">{task.status}</span>
                          <p>{task.acceptance}</p>
                          <small>
                            {language === 'zh' ? '验证' : 'Verification'}:{' '}
                            {task.verification?.status === 'checked'
                              ? language === 'zh'
                                ? '结果已记录并绑定版本（非独立验收）'
                                : 'Observed result bound to version (not independent review)'
                              : task.verification?.status === 'stale'
                                ? language === 'zh'
                                  ? '已过期，需要重新检查'
                                  : 'Stale; recheck required'
                                : language === 'zh'
                                  ? '执行者声明，未绑定版本'
                                  : 'Author-reported; no version binding'}
                          </small>
                          <small>
                            {task.id} · {task.dependsOn.join(', ')} · {task.owner || '—'}
                          </small>
                          {task.note && <p>{task.note}</p>}
                          {!!task.evidence.length && (
                            <p>
                              {language === 'zh' ? '证据事件' : 'Evidence events'}:{' '}
                              {task.evidence.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </details>
                  )}
                  {!!detail?.unknownEffects.length && (
                    <details className="notice recovery-card" key={selected}>
                      <summary>
                        {language === 'zh'
                          ? '待核对的中断操作'
                          : 'Interrupted operations to inspect'}{' '}
                        · {detail.unknownEffects.length}
                      </summary>
                      <p>
                        {t('settings') !== 'Settings'
                          ? '可以继续对话并进行只读检查；未知命令不会自动重跑。先自动核对，仍无法判断时再记录人工结论。'
                          : 'You can continue chatting and inspect safely. Unknown commands are never replayed. Try automatic checks before recording a manual conclusion.'}
                      </p>
                      <button
                        onClick={() =>
                          void action(async () => {
                            await api('/conversations/' + selected + '/recovery/check', {});
                            await load(selected!);
                          })
                        }
                      >
                        {t('settings') !== 'Settings'
                          ? '自动核对现有结果'
                          : 'Check existing results automatically'}
                      </button>
                      {detail?.unknownEffects.map((e: any) => (
                        <div className="notice" key={e.id}>
                          <strong>{t('inspect')}</strong>
                          <pre>{e.tool + ' ' + e.args}</pre>
                          <p className="muted">
                            {t('settings') !== 'Settings'
                              ? '上次结果仍未知。允许重新尝试可能重复产生副作用；此按钮不立即执行，后续仍遵守正常权限与审批。'
                              : 'The previous outcome remains unknown. Retrying may duplicate side effects. This button does not execute anything; normal permissions and approval still apply.'}
                          </p>
                          <button
                            disabled={running}
                            onClick={() =>
                              void action(async () => {
                                await api('/effects/' + e.id + '/allow-retry', {});
                                await load(selected!);
                              })
                            }
                          >
                            {t('settings') !== 'Settings'
                              ? '允许下次重新尝试'
                              : 'Allow another attempt'}
                          </button>

                          <button
                            onClick={() =>
                              void action(async () => {
                                const note = prompt(
                                  'Describe the actual outcome after inspecting the files/processes.',
                                );
                                if (note) {
                                  await api('/effects/' + e.id + '/resolve', { note });
                                  await load(selected!);
                                }
                              })
                            }
                          >
                            {t('Record inspected outcome')}
                          </button>
                        </div>
                      ))}
                    </details>
                  )}
                  {run && !running && (
                    <div className={'run-result ' + run.status}>
                      <span className="dot" />
                      {run.status}
                      <span>{totalUsage!.modelCalls} model calls 路 parent + children</span>
                      <span>
                        {(totalUsage!.inputTokens + totalUsage!.outputTokens).toLocaleString()}{' '}
                        tokens
                      </span>
                      <span>
                        {totalUsage!.estimatedUsd === null
                          ? t('unknownCost')
                          : '~$' + totalUsage!.estimatedUsd!.toFixed(5)}
                      </span>
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
              </div>
              <Composer
                {...{
                  run,
                  running,
                  detail,
                  send,
                  draft,
                  setDraft,
                  drag,
                  setDrag,
                  action,
                  addFiles,
                  draftRef,
                  upload,
                  profile,
                  state,
                  conversation,
                  update,
                  project,
                  t,
                  stick,
                  bottom,
                  sending,
                }}
              />
            </div>
            {inspector && (
              <Inspector
                {...{
                  t,
                  setInspector,
                  tab: inspectorTab,
                  setTab: setInspectorTab,
                  conversation,
                  running,
                  state,
                  action,
                  update,
                  project,
                  run: totalUsage,
                }}
              />
            )}
          </div>
        )}
      </main>
      {projectDialog && (
        <ProjectDialog
          {...{
            t,
            setProjectDialog,
            projectName,
            setProjectName,
            projectFolders,
            setProjectFolders,
            language,
            action,
            newChat,
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
