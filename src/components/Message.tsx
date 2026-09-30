import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  GitBranch,
  Sparkles,
  Terminal,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useState } from 'react';
import type { AgentEvent } from '../../shared/types';
import { api } from '../api';
import { Markdown } from './Markdown';
export function Message({
  event,
  t,
  onBranch,
  notify,
}: {
  event: AgentEvent;
  t: (s: string) => string;
  onBranch: (id: number) => void;
  notify: (s: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const user = event.type === 'user.message';
  return (
    <article className={'message ' + (user ? 'user' : 'assistant')} id={'event-' + event.id}>
      <div className="message-heading">
        {user ? (
          <span className="avatar user-avatar">Y</span>
        ) : (
          <span className="avatar">
            <Sparkles size={15} />
          </span>
        )}
        <strong>{user ? 'You' : 'AgentDemo'}</strong>
        <time>
          {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
        {event.data.incomplete && <span className="pill">{t('Interrupted output')}</span>}
        {event.data.steering && <span className="pill">↳</span>}
      </div>
      <div className="message-body">
        <Markdown text={event.data.text || ''} />
        {user && event.data.attachments?.length > 0 && (
          <div className="message-attachments">
            {event.data.attachments.map((a: { id: string; name: string; mime: string }) => (
              <a
                key={a.id}
                href={
                  '/api/attachments/' +
                  a.id +
                  (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(a.mime)
                    ? '?preview=1'
                    : '')
                }
                target="_blank"
                rel="noopener noreferrer"
                className="message-attachment"
              >
                {['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(a.mime) ? (
                  <img
                    src={'/api/attachments/' + a.id + '?preview=1'}
                    alt={a.name}
                    loading="lazy"
                  />
                ) : (
                  <span>📎 {a.name}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="message-actions">
        <button
          title={t('copy')}
          onClick={async () => {
            await navigator.clipboard.writeText(event.data.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {!user && (
          <>
            <button title={t('branch')} onClick={() => onBranch(event.id)}>
              <GitBranch size={14} />
            </button>
            {['up', 'down'].map((r) => (
              <button
                key={r}
                title={r === 'up' ? 'Helpful' : 'Not helpful'}
                onClick={() =>
                  void api('/feedback', {
                    conversationId: event.conversationId,
                    eventId: event.id,
                    rating: r,
                  })
                    .then(() => notify(t('feedback')))
                    .catch((e) => notify(e.message))
                }
              >
                {r === 'up' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
              </button>
            ))}
          </>
        )}
      </div>
    </article>
  );
}
export function Activity({ events, t }: { events: AgentEvent[]; t: (s: string) => string }) {
  const label = (e: AgentEvent) =>
    e.type === 'model.protocol-repair'
      ? t(
          e.data.code === 'OUTPUT_LIMIT'
            ? 'Output truncated; retrying one smaller step'
            : 'Correcting model tool arguments',
        )
      : e.type === 'model.started'
        ? 'Thinking · ' + e.data.model
        : e.type === 'tool.started'
          ? e.data.name + ' · ' + JSON.stringify(e.data.arguments)
          : e.type === 'tool.completed'
            ? e.data.name + ' · ' + String(e.data.output).slice(0, 100)
            : e.type === 'context.compacted'
              ? 'Context compacted'
              : e.type === 'child.started'
                ? 'Delegated · ' + e.data.task
                : e.type;
  return (
    <details className="activity">
      <summary>
        <Terminal size={14} />
        <span>
          {t('steps')} · {events.length}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="activity-preview">
        {events.slice(-2).map((e) => (
          <div key={e.id}>{label(e)}</div>
        ))}
      </div>
      <div className="activity-full">
        {events.map((e) => (
          <details key={e.id}>
            <summary>
              <span className="dot" />
              <span>{label(e)}</span>
              <time>{new Date(e.createdAt).toLocaleTimeString()}</time>
            </summary>
            <pre>{JSON.stringify(e.data, null, 2)}</pre>
          </details>
        ))}
      </div>
    </details>
  );
}
export function InputCard({ input, t, refresh, notify }: any) {
  const [answer, setAnswer] = useState('');
  const pending = input.status === 'pending';
  const respond = (allow: boolean) =>
    api('/inputs/' + input.id, { answer: answer || (allow ? 'Approved' : 'Denied'), allow })
      .then(refresh)
      .catch((e: any) => notify(e.message));
  return (
    <details
      key={input.id + ':' + input.status}
      open={pending}
      id={'input-' + input.id}
      tabIndex={-1}
      className={'input-card ' + (!pending ? 'answered' : '')}
    >
      <summary className="input-title">
        <AlertCircle size={17} />
        <strong>{input.kind === 'approval' ? t('approval') : input.payload.question}</strong>
        {!pending && <span className="input-answer-preview">{input.answer}</span>}
        <span className="pill">{input.status}</span>
      </summary>
      <div className="input-content">
        {input.kind === 'approval' ? (
          <>
            <p>{input.payload.reason}</p>
            <pre>{input.payload.command}</pre>
            {input.payload.review?.changes?.map((change: any) => (
              <details className="file-diff" key={change.path}>
                <summary>
                  {change.path}
                  {change.conflict ? ' · ' + t('Conflict') : ''}
                </summary>
                <pre>{change.diff}</pre>
              </details>
            ))}
            {input.payload.backend && (
              <small>
                {input.payload.cwd} · {input.payload.backend} · {input.payload.timeoutSeconds}s
              </small>
            )}
            <p className="muted">
              {input.payload.backend === 'approval-host'
                ? t('settings') !== 'Settings'
                  ? '宿主执行：批准后可访问当前账号的文件和网络。工作目录不是隔离边界。'
                  : 'Host execution: approval permits access to your account’s files and network. The working directory is not an isolation boundary.'
                : input.payload.backend
                  ? t('settings') !== 'Settings'
                    ? '使用所示隔离后端；预检失败不会退回宿主。网络策略由设置决定。'
                    : 'Uses the indicated isolation backend; no host fallback on preflight failure. Network policy is configured separately.'
                  : t('trustedWarning')}
            </p>
          </>
        ) : null}
        {pending ? (
          <>
            <div className="choice-row">
              {input.payload.options?.map((s: string) => (
                <button key={s} onClick={() => setAnswer(s)}>
                  {s}
                </button>
              ))}
            </div>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={input.kind === 'approval' ? 'Optional note' : t('answer')}
            />
            <div className="row end">
              {input.kind === 'approval' && (
                <button onClick={() => respond(false)}>{t('deny')}</button>
              )}
              <button className="primary" onClick={() => respond(true)}>
                {input.kind === 'approval' ? t('allow') : t('answer')}
              </button>
            </div>
          </>
        ) : (
          <p>{input.answer}</p>
        )}
      </div>
    </details>
  );
}
