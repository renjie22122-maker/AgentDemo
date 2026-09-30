import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../api';
import type { ConversationDetail, UiState } from '../types';
import { Markdown } from './Markdown';
import { Activity, InputCard } from './Message';

export function TeamChat({
  state,
  detail,
  zh,
  t,
  notify,
}: {
  state: UiState;
  detail: ConversationDetail;
  zh: boolean;
  t: (s: string) => string;
  notify: (s: string) => void;
}) {
  const own = state.runs.filter((r) => r.conversationId === detail.conversation.id).at(-1);
  const ids = new Set(detail.teamMembers?.map((m) => m.runId) || []);
  if (own) ids.add(own.id);
  // Include descendants for ordinary delegation as well as enrolled peer teams.
  for (let i = 0; i < state.runs.length; i++)
    for (const r of state.runs) if (r.parentRunId && ids.has(r.parentRunId)) ids.add(r.id);
  const members = state.runs.filter(
    (r) => ids.has(r.id) && r.conversationId !== detail.conversation.id,
  );
  const key = members
    .map((r) => r.conversationId)
    .sort()
    .join(',');
  const [views, setViews] = useState<Record<string, ConversationDetail>>({});
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setViews({});
    setFilter('');
    const update = async () => {
      const results = await Promise.allSettled(
        [...new Set(key.split(',').filter(Boolean))].map(
          async (id) => [id, await api<ConversationDetail>('/conversations/' + id)] as const,
        ),
      );
      if (disposed) return;
      setViews((previous) => {
        const next = { ...previous };
        for (const result of results)
          if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        return next;
      });
      setError(
        results.some((r) => r.status === 'rejected')
          ? zh
            ? '部分成员更新失败，正在重试'
            : 'Some members could not refresh. Retrying.'
          : '',
      );
      timer = setTimeout(update, 2500);
    };
    void update();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [key, detail.conversation.id, zh, revision]);
  if (!members.length) return null;
  const name = (id: string) =>
    state.conversations.find((c) => c.id === id)?.title || id.slice(0, 8);
  const visible = members.filter((m) => !filter || m.conversationId === filter);
  const allowed = new Set(visible.map((m) => m.id));
  const messages = visible
    .flatMap((m) =>
      (views[m.conversationId]?.events || [])
        .filter((e) => e.runId === m.id && e.type === 'assistant.message')
        .map((e) => ({ ...e, member: m })),
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  return (
    <section className="team-chat" aria-label={zh ? '团队群聊' : 'Team chat'}>
      <details
        className="team-chat-content"
        ref={(el) => {
          if (el && !el.dataset.initialized) {
            el.open = detail.teamSpace?.mode === 'creative';
            el.dataset.initialized = 'true';
          }
        }}
      >
        <summary>
          <Users size={18} />
          <strong>
            {zh
              ? detail.teamSpace?.mode === 'creative'
                ? '团队群聊'
                : '团队进度'
              : detail.teamSpace?.mode === 'creative'
                ? 'Team chat'
                : 'Team progress'}
          </strong>
          <span>
            {
              members.filter((m) => !['completed', 'failed', 'interrupted'].includes(m.status))
                .length
            }{' '}
            {zh ? '执行中' : 'active'} · {members.length} {zh ? '位成员' : 'members'}
            {members.some((m) =>
              ['failed', 'interrupted', 'waiting_user', 'waiting_approval'].includes(m.status),
            ) && (zh ? ' · 需要关注' : ' · Needs attention')}
          </span>
        </summary>
        <div className="team-chat-members" aria-label={zh ? '筛选成员' : 'Filter members'}>
          <button aria-pressed={!filter} onClick={() => setFilter('')}>
            {zh ? '全部' : 'All'}
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              aria-pressed={filter === m.conversationId}
              onClick={() => setFilter(m.conversationId)}
            >
              <span>{name(m.conversationId)}</span>
              <small>{m.status.replaceAll('_', ' ')}</small>
            </button>
          ))}
        </div>
        {error && <p role="status">{error}</p>}
        <div className="team-chat-feed">
          {!messages.length && (
            <p className="muted">
              {zh
                ? '成员正在工作，回复会显示在这里。'
                : 'Members are working. Their replies will appear here.'}
            </p>
          )}
          {messages.map((e) => (
            <article className="team-chat-message" key={e.id}>
              <header>
                <span className="avatar">{name(e.conversationId).slice(0, 1)}</span>
                <strong>{name(e.conversationId)}</strong>
                <time>
                  {new Date(e.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </header>
              <Markdown text={e.data.text || ''} />
            </article>
          ))}
          {visible.flatMap((m) =>
            (views[m.conversationId]?.streams || [])
              .filter((s) => s.runId === m.id)
              .map((s) => (
                <article className="team-chat-message" key={'stream-' + s.runId}>
                  <header>
                    <strong>{name(m.conversationId)}</strong>
                    <span className="working-dot" />
                  </header>
                  <Markdown text={s.text} />
                </article>
              )),
          )}
          {detail.teamSpace?.messages
            .filter((m) => !filter || allowed.has(m.sender))
            .map((m) => (
              <article className="team-chat-message discussion" key={m.id}>
                <header>
                  <strong>
                    {name(state.runs.find((r) => r.id === m.sender)?.conversationId || m.sender)}
                  </strong>
                  <small>{zh ? '团队讨论' : 'Team discussion'}</small>
                </header>
                <Markdown text={m.text} />
              </article>
            ))}
        </div>
        {visible.map((m) => (
          <div key={m.id} className="team-chat-work">
            <details>
              <summary>
                {name(m.conversationId)} · {zh ? '执行步骤' : 'Execution steps'}
              </summary>
              <Activity
                events={(views[m.conversationId]?.events || []).filter(
                  (e) =>
                    e.runId === m.id && !['user.message', 'assistant.message'].includes(e.type),
                )}
                t={t}
              />
            </details>
          </div>
        ))}
      </details>
      {members.map((m) =>
        (views[m.conversationId]?.inputs || [])
          .filter((q) => q.runId === m.id && q.status === 'pending')
          .map((q) => (
            <div className="team-chat-attention" key={q.id}>
              <strong>{name(m.conversationId)}</strong>
              <InputCard
                input={q}
                t={t}
                notify={notify}
                refresh={() => setRevision((n) => n + 1)}
              />
            </div>
          )),
      )}
    </section>
  );
}
