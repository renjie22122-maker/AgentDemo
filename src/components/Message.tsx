import { approvalRisk } from '../../shared/approval-risk';
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
        <strong>{user ? 'You' : t('AgentDemo')}</strong>
        <time>
          {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
        {event.data.incomplete && <span className="pill">{t('Interrupted output')}</span>}
        {event.data.steering && <span className="pill">↳</span>}
        {user && event.data.delivery === 'pending' && (
          <span className="pill">
            {event.data.steering
              ? t('settings') === 'Settings'
                ? 'Queued for the next step in this conversation'
                : '已收到；当前步骤结束后交给模型，可停止当前任务'
              : t('settings') === 'Settings'
                ? 'Starting this conversation'
                : '正在启动本对话'}
          </span>
        )}
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
  const [expanded, setExpanded] = useState(false);
  const label = (e: AgentEvent) =>
    e.type === 'cognitive.intervention'
      ? (t('settings') === 'Settings' ? 'Runtime guidance' : '运行建议') +
        ' · ' +
        ((t('settings') === 'Settings'
          ? {
              'change-strategy': 'Change approach',
              'diagnose-blocker': 'Inspect tool failures',
              'review-plan': 'Review blocked tasks',
              verify: 'Check pending verification',
              stop: 'Repeated loop stopped',
            }
          : ({
              'change-strategy': '调整重复操作',
              'diagnose-blocker': '检查工具失败原因',
              'review-plan': '检查受阻任务',
              verify: '补充待完成验证',
              stop: '重复循环已停止',
            } as Record<string, string>))[e.data.action as string] || e.data.action)
      : e.type === 'command.background'
        ? (t('settings') === 'Settings' ? 'Background command' : '后台命令') +
          ' · ' +
          e.data.status +
          ' · ' +
          e.data.id +
          ' · ' +
          (e.data.stdout || e.data.error || '').slice(-160)
        : e.type === 'command.progress'
          ? (t('settings') === 'Settings' ? 'Command running' : '命令执行中') +
            ' · ' +
            e.data.elapsedSeconds +
            's / ' +
            e.data.timeoutSeconds +
            's · ' +
            (e.data.outputTail ||
              (t('settings') === 'Settings' ? 'Waiting for output' : '等待输出'))
          : e.type === 'model.protocol-repair'
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
    <details
      className="activity"
      onToggle={(e) => {
        if (e.target === e.currentTarget) setExpanded(e.currentTarget.open);
      }}
    >
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
        {expanded &&
          events.map((e) => (
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
  const [sending, setSending] = useState(false);
  const zh = t('settings') !== 'Settings';
  const pending = input.status === 'pending';
  const risk = input.payload.risk || approvalRisk(input.payload);
  const respond = async (allow: boolean, alternative = false) => {
    if (sending) return;
    setSending(true);
    try {
      await api('/inputs/' + input.id, {
        answer:
          answer ||
          (alternative
            ? 'Do not execute this operation. Propose a safer or narrower alternative and explain it.'
            : allow
              ? 'Approved once for the exact operation shown.'
              : 'Denied'),
        allow,
      });
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSending(false);
    }
  };
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
        {input.kind === 'approval' && (
          <span
            className={'risk-badge risk-' + risk.level}
            title={t('settings') === 'Settings' ? risk.reason : risk.zh}
          >
            {t('settings') === 'Settings'
              ? (
                  {
                    low: 'Low risk',
                    medium: 'Review scope',
                    high: 'High risk',
                    unknown: 'Uncertain',
                  } as any
                )[risk.level]
              : ({ low: '低风险', medium: '注意范围', high: '高风险', unknown: '风险未明' } as any)[
                  risk.level
                ]}
          </span>
        )}
        {!pending && <span className="input-answer-preview">{input.answer}</span>}
        <span className="pill">{input.status}</span>
      </summary>
      <div className="input-content">
        {input.status === 'cancelled' && (
          <div className="review-question">
            <p>
              {zh
                ? '等待已因任务停止或服务重启而中断，并非审批超时。继续会重新核对请求，不会把旧请求直接当作已批准。'
                : 'Waiting was interrupted by a stopped run or service restart, not approval expiry. Continue to reassess; the old request is not approved.'}
            </p>
            <button
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  await api('/conversations/' + input.conversationId + '/message', {
                    text:
                      'Continue the unfinished task. First inspect existing results and interrupted approval ' +
                      input.id +
                      '. Reassess any unapproved action using current scope. Do not replay completed or unknown side effects.',
                  });
                  await refresh();
                } catch (e: any) {
                  notify(e.message);
                } finally {
                  setSending(false);
                }
              }}
            >
              {zh ? '核对并继续任务' : 'Inspect and continue task'}
            </button>
          </div>
        )}
        {pending && (
          <p className="muted">
            {zh
              ? '等待你的决定；等待不计入命令执行时限，可稍后返回处理。'
              : 'Waiting for your decision. Approval waiting does not consume the command execution timeout.'}
          </p>
        )}

        {input.kind === 'approval' ? (
          <>
            {pending && input.payload.autoReview?.decision === 'ask' && (
              <div className="review-question" role="note">
                <strong>{zh ? '需要你确认' : 'Your confirmation is needed'}</strong>
                <p>
                  {input.payload.clarification ||
                    (zh
                      ? '是否允许执行下方这一项具体操作？请核对对象、范围及审核原因；批准仅限本次。'
                      : 'May I carry out the exact operation below? Review its target, scope and assessment. Approval applies once only.')}
                </p>
                <small>
                  {zh
                    ? '你也可以补充限制或选择换一种方案。补充限制时请点“换一种方案”，不会执行当前操作。'
                    : 'You may add constraints or request an alternative. Use “Request alternative” for changed constraints; the current operation will not execute.'}
                </small>
              </div>
            )}
            <p>{input.payload.reason}</p>
            <p className={'risk-explanation risk-' + risk.level}>
              {t('settings') === 'Settings' ? risk.reason : risk.zh}
              {t('settings') === 'Settings'
                ? ' · Heuristic signal, not a safety guarantee.'
                : ' · 自动提示，不是安全保证。'}
            </p>
            {input.payload.background && (
              <p className="muted">
                {t('settings') === 'Settings'
                  ? 'Deferred command: independent work may continue. This command starts only after approval; its execution timeout does not include approval waiting.'
                  : '后台审批：可先做独立工作；此命令获批后才执行，等待审批不计入命令执行时限。'}
              </p>
            )}
            {input.payload.autoReview && (
              <p className="review-rationale">
                {input.payload.autoReview.reason} ·{' '}
                {input.payload.autoReview.usage
                  ? (
                      (input.payload.autoReview.usage.input || 0) +
                      (input.payload.autoReview.usage.output || 0)
                    ).toLocaleString() + ' tokens'
                  : ''}
              </p>
            )}
            {input.payload.request && (
              <details>
                <summary>
                  {t('settings') !== 'Settings'
                    ? '具体请求与上传内容'
                    : 'Exact request and uploads'}
                </summary>
                <pre>{JSON.stringify(input.payload.request, null, 2)}</pre>
              </details>
            )}

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
              {input.payload.backend === 'media-service'
                ? t('settings') !== 'Settings'
                  ? '请求内容将发送给所选媒体服务，可能产生费用。'
                  : 'Request content is sent to the selected media provider and may incur charges.'
                : input.payload.backend === 'approval-host'
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
              disabled={sending}
              placeholder={
                input.kind === 'approval'
                  ? zh
                    ? '补充说明或限制（可选）'
                    : 'Notes or constraints (optional)'
                  : t('answer')
              }
            />
            <div className="row end">
              {input.kind === 'approval' && (
                <>
                  <button disabled={sending} onClick={() => void respond(false)}>
                    {t('deny')}
                  </button>
                  {input.payload.autoReview?.decision === 'ask' && (
                    <button disabled={sending} onClick={() => void respond(false, true)}>
                      {zh ? '换一种方案' : 'Request alternative'}
                    </button>
                  )}
                </>
              )}
              <button className="primary" disabled={sending} onClick={() => void respond(true)}>
                {sending
                  ? zh
                    ? '提交中…'
                    : 'Submitting…'
                  : input.kind === 'approval'
                    ? zh
                      ? '仅本次允许'
                      : 'Allow once'
                    : t('answer')}
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
