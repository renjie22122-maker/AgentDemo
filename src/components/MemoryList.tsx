import { submitMemoryBatch } from '../memory-batch';
import { memoryDecayPolicy } from '../../shared/memory-decay';
import { memoryReach, memoryConversation } from '../../shared/memory-scope';
import { useMemo, useState } from 'react';
import type { Memory } from '../../shared/types';
import { api } from '../api';
import { MemoryDetails } from './MemoryWorkbench';

function status(m: Memory) {
  if (
    m.status === 'superseded' ||
    m.status === 'forgotten' ||
    (m.expiresAt != null && m.expiresAt <= Date.now()) ||
    (m.validUntil != null && m.validUntil <= Date.now())
  )
    return 'history';
  if (m.status === 'inactive') return 'inactive';
  if (m.status === 'disputed') return 'disputed';
  return m.active ? 'active' : 'candidate';
}
export function MemoryList({
  memories,
  conversations = [],
  scope,
  zh,
  go,
}: {
  memories: Memory[];
  conversations?: { id: string; title: string }[];
  scope: string;
  zh: boolean;
  go: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [filter, setFilter] = useState('current'),
    [query, setQuery] = useState('');
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false),
    [report, setReport] = useState<any>(null);
  const label = (en: string, cn: string) => (zh ? cn : en);
  const decayNames = {
    stable: label('No decay', '不衰减'),
    time: label('Time', '时间'),
    turns: label('User turns', '用户轮次'),
    'time-and-turns': label('Time + user turns', '时间＋用户轮次'),
  };
  const sourceName = (m: Memory) => {
    const chatId = memoryConversation(m);
    const chat = conversations.find((c) => c.id === chatId);
    if (chat) return chat.title || label('Untitled conversation', '未命名对话');
    if (chatId) return label('Source conversation unavailable', '来源对话暂不可用');
    if (m.source === 'User') return label('Manually entered', '手动输入');
    if (m.source && !m.source.startsWith('chat:')) return m.source;
    return label('Incomplete source information', '来源信息不完整');
  };
  const names: Record<string, string> = {
    current: label('Current', '当前'),
    active: label('Enabled · recalled when relevant', '已启用 · 可按需召回'),
    candidate: label('Awaiting confirmation', '待确认'),
    inactive: label('Deactivated', '已停用'),
    disputed: label('Conflicts', '冲突'),
    history: label('History / expired', '历史／过期'),
    all: label('All', '全部'),
  };
  const scoped = useMemo(() => memories.filter((m) => m.scope === scope), [memories, scope]);
  const filtered = scoped
    .filter(
      (m) =>
        (filter === 'all' ||
          (filter === 'current' ? status(m) !== 'history' : status(m) === filter)) &&
        [m.content, m.topic, m.source].join(' ').toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const lastPage = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 25, (currentPage + 1) * 25);
  const items = Object.entries(selected).map(([id, revision]) => ({ id, revision }));
  const perform = async (action: 'confirm' | 'deactivate' | 'forget') => {
    if (
      action === 'forget' &&
      !window.confirm(
        label(
          'Permanently forget the selected memories? Their history is removed and their sources excluded from extraction.',
          '彻底忘记所选记忆？将删除这些记忆的历史，并排除对应来源，避免自动重新提取。',
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await go(async () => {
        setReport({ outcomes: [], changed: 0, failed: 0, processed: 0, total: items.length });
        await submitMemoryBatch(
          items,
          (chunk) => api('/memories/batch', { scope, action, items: chunk }),
          (result) => {
            setReport(result);
            setSelected((previous) =>
              Object.fromEntries(
                Object.entries(previous).filter(
                  ([id]) => !result.outcomes.some((x) => x.id === id && x.ok),
                ),
              ),
            );
          },
        );
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={label('Memory management', '记忆管理')}>
      <div className="panel">
        <h3>
          {label('Manage memories', '管理记忆')} · {scoped.length}
        </h3>
        {scoped.some((m) => status(m) === 'disputed') && (
          <div role="status" className="panel" style={{ borderLeft: '3px solid #d99532' }}>
            <strong>
              {label('Ambiguous memory conflicts need review', '存在需要核实的模糊记忆冲突')} ·{' '}
              {scoped.filter((m) => status(m) === 'disputed').length}
            </strong>
            <p>
              {label(
                'Conflicting entries are excluded from recall. Compare the statements and sources before choosing which applies; bulk confirmation does not resolve contradictions.',
                '冲突条目已退出召回。请比较说法与来源后选择适用内容；批量确认不会自动裁决矛盾。',
              )}
            </p>
            <button
              onClick={() => {
                setFilter('disputed');
                setQuery('');
                setPage(0);
              }}
            >
              {label('Review conflicts', '查看冲突')}
            </button>
          </div>
        )}
        <div className="row">
          <input
            aria-label={label('Search memories', '搜索记忆')}
            placeholder={label('Search content, topic or source', '搜索内容、主题或来源')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <select
            aria-label={label('Memory status', '记忆状态')}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            {Object.entries(names).map(([value, name]) => (
              <option key={value} value={value}>
                {name} (
                {
                  scoped.filter(
                    (m) =>
                      value === 'all' ||
                      (value === 'current' ? status(m) !== 'history' : status(m) === value),
                  ).length
                }
                )
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          {label(
            'Candidates await permission to recall; deactivated entries were explicitly disabled. Confirmation allows use, not proof of truth. Conflicts need separate resolution. Selection is unlimited; requests run in batches.',
            '待确认：尚未允许召回。已停用：用户主动停止召回。确认／启用是允许使用，不代表验证为真；冲突需单独处理。选择数量不设上限，自动分批执行。',
          )}
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            disabled={busy}
            onClick={() =>
              setSelected((previous) => ({
                ...previous,
                ...Object.fromEntries(visible.map((m) => [m.id, m.revision])),
              }))
            }
          >
            {label('Select this page', '选择本页')}
          </button>
          <button
            disabled={busy}
            onClick={() => setSelected(Object.fromEntries(filtered.map((m) => [m.id, m.revision])))}
          >
            {label('Select all matching', '选择全部筛选结果')} ({filtered.length})
          </button>
          <button disabled={busy} onClick={() => setSelected({})}>
            {label('Clear', '取消选择')}
          </button>
          <span>
            {label('Selected', '已选')} {items.length}
          </span>
          <button disabled={busy || !items.length} onClick={() => void perform('confirm')}>
            {items.length &&
            items.every((x) => scoped.find((m) => m.id === x.id)?.status === 'inactive')
              ? label('Reactivate selected', '重新启用所选')
              : label('Confirm / activate selected', '确认／启用所选')}
          </button>
          <button disabled={busy || !items.length} onClick={() => void perform('deactivate')}>
            {label('Deactivate selected', '批量停用')}
          </button>
          <button disabled={busy || !items.length} onClick={() => void perform('forget')}>
            {label('Forget selected', '批量忘记')}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              go(async () => {
                const result: any = await api('/memories/consolidate', { scope });
                setReport({ changed: result.merged, failed: 0, outcomes: [] });
              })
            }
          >
            {label('Merge exact duplicates', '归并完全重复项')}
          </button>
        </div>
        {report && (
          <div role="status">
            {label('Processed', '已处理')} {report.processed ?? report.changed} /{' '}
            {report.total ?? report.changed} · {label('Changed', '已更改')} {report.changed} ·{' '}
            {label('Not changed', '未更改')} {report.failed}
            {report.outcomes
              .filter((x: any) => !x.ok)
              .map((x: any) => (
                <p key={x.id}>
                  {scoped.find((m) => m.id === x.id)?.content.slice(0, 70) ||
                    label('Record unavailable', '条目不可用')}{' '}
                  · {x.reason}
                </p>
              ))}
          </div>
        )}
      </div>
      {visible.map((m) => (
        <article className="panel" key={m.id}>
          <div className="row">
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              aria-label={label('Select memory: ', '选择记忆：') + m.content}
              checked={selected[m.id] != null}
              disabled={busy}
              onChange={(e) =>
                setSelected((previous) => {
                  const next = { ...previous };
                  if (e.target.checked) next[m.id] = m.revision;
                  else delete next[m.id];
                  return next;
                })
              }
            />
            <span className={'pill ' + (status(m) === 'active' ? 'success' : '')}>
              {names[status(m)]}
            </span>
            <small>
              {memoryReach(m) === 'conversation'
                ? label('Original conversation only', '仅原对话')
                : label('Shared within this scope', '本范围共享')}
            </small>
            <small>
              {memoryDecayPolicy(m) === 'stable'
                ? label('Stable / no decay', '稳定／不衰减')
                : label('Decay: ', '衰减：') + decayNames[memoryDecayPolicy(m)]}
            </small>
            {m.automatic && <small>{label('Automatic', '自动管理')}</small>}
          </div>
          <p>{m.content}</p>
          {status(m) === 'disputed' && (
            <div className="muted">
              <strong>{label('Conflicting with:', '与以下记忆冲突：')}</strong>
              {(m.conflictsWith || []).map((id) => {
                const other = scoped.find((x) => x.id === id);
                return (
                  <p key={id}>
                    {other?.content || label('Source entry unavailable', '原条目不可用')}
                    {other && <small> · {sourceName(other)}</small>}
                  </p>
                );
              })}
              <p>
                {label(
                  'Expand details to compare sources and resolve.',
                  '展开详情可核对来源并处理冲突。',
                )}
              </p>
            </div>
          )}
          <details>
            <summary>{label('Source, editing and history', '来源、编辑与历史')}</summary>
            <MemoryDetails key={m.id + ':' + m.revision} memory={m} go={go} zh={zh} />
            <small className="muted">
              {m.source} · rev {m.revision}
            </small>
          </details>
        </article>
      ))}
      {!visible.length && <p>{label('No matching memories.', '没有符合条件的记忆。')}</p>}
      <div className="row">
        <button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          {label('Previous', '上一页')}
        </button>
        <span>
          {currentPage + 1} / {lastPage + 1} · {filtered.length}
        </span>
        <button disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>
          {label('Next', '下一页')}
        </button>
      </div>
    </section>
  );
}
