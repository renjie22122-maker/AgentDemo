import { RelationGraph } from './RelationGraph';

import { useState } from 'react';
import { GitBranch, ListTree, MessagesSquare, ArrowRight } from 'lucide-react';
import type { ConversationDetail, RunView, UiState } from '../types';
import { communicationEdges, relationTree } from '../team-relations';

export function TeamRelations({
  runs,
  state,
  detail,
  views,
  zh,
  onMember,
}: {
  runs: RunView[];
  state: UiState;
  detail: ConversationDetail;
  views: Record<string, ConversationDetail>;
  zh: boolean;
  onMember: (conversationId: string) => void;
}) {
  const [tab, setTab] = useState<'agents' | 'tasks' | 'messages'>('agents');
  const [taskId, setTaskId] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const label = (en: string, cn: string) => (zh ? cn : en);
  const tasks = detail.taskBoard?.tasks || [];
  const name = (id: string) => {
    const run = runs.find((r) => r.id === id);
    return (
      state.conversations.find((c) => c.id === run?.conversationId)?.title ||
      label('Unavailable member', '成员记录不可用')
    );
  };
  const status = (s: string) =>
    zh
      ? (
          {
            running: '执行中',
            pending: '待开始',
            completed: '已完成',
            done: '已完成',
            failed: '失败',
            interrupted: '已中断',
            blocked: '受阻',
            waiting_user: '等待回复',
            waiting_approval: '等待审批',
            queued: '排队中',
          } as Record<string, string>
        )[s] || s
      : s.replaceAll('_', ' ');
  const edges = communicationEdges(
    runs,
    [...detail.events, ...Object.values(views).flatMap((v) => v.events)],
    detail.teamSpace?.messages || [],
  );
  const chosen = tasks.find((t) => t.id === taskId);
  const member = (id: string) => {
    const run = runs.find((r) => r.id === id);
    if (run) onMember(run.conversationId);
  };
  const rows = relationTree(runs);
  const limit = expanded ? Infinity : 30;
  return (
    <div className="team-relations">
      <div
        className="team-relation-tabs"
        role="group"
        aria-label={label('Relationship view', '关系视图')}
      >
        {(
          [
            {
              id: 'agents',
              icon: GitBranch,
              title: label('Agents', '成员关系'),
              count: runs.length,
            },
            {
              id: 'tasks',
              icon: ListTree,
              title: label('Dependencies', '任务依赖'),
              count: tasks.length,
            },
            {
              id: 'messages',
              icon: MessagesSquare,
              title: label('Communication', '通信关系'),
              count: edges.length,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setExpanded(false);
            }}
          >
            <item.icon size={15} />
            {item.title}
            <span>{item.count}</span>
          </button>
        ))}
      </div>
      <p className="muted">
        {tab === 'agents'
          ? label(
              'Arrows show creation/delegation. Peer team roles do not change these recorded origins. Click a node to filter activity.',
              '箭头表示创建／委派关系，平级团队角色不改变记录中的创建来源。点击节点筛选工作记录。',
            )
          : tab === 'tasks'
            ? label(
                'Prerequisite → dependent task. Click a task for acceptance and ownership.',
                '前置任务 → 后续任务。点击任务查看验收要求和负责人。',
              )
            : label(
                'Sender → recipient; numbers count recorded submissions, not read receipts.',
                '发送者 → 接收者；数字为已记录提交次数，不代表已读。',
              )}
      </p>
      {tab === 'tasks' && !tasks.length && (
        <p>{label('No declared tasks yet.', '尚未声明任务依赖。')}</p>
      )}
      {tab === 'messages' && !edges.length && (
        <p>
          {label(
            'No structured communication records yet.',
            '暂无结构化通信记录；旧私信不会凭文字补猜。',
          )}
        </p>
      )}
      <RelationGraph
        zh={zh}
        peer={tab === 'messages'}
        onSelect={(id) => {
          if (tab === 'tasks') {
            setTaskId(id);
            setListOpen(true);
          } else member(id);
        }}
        nodes={
          tab === 'tasks'
            ? tasks.map((task) => ({
                id: task.id,
                label: task.title,
                subtitle: status(task.status) + (task.owner ? ' · ' + name(task.owner) : ''),
              }))
            : runs.map((run) => ({ id: run.id, label: name(run.id), subtitle: status(run.status) }))
        }
        edges={
          tab === 'tasks'
            ? tasks.flatMap((task) => task.dependsOn.map((id) => ({ from: id, to: task.id })))
            : tab === 'messages'
              ? edges.map((edge) => ({ from: edge.from, to: edge.to, label: String(edge.count) }))
              : runs
                  .filter((run) => run.parentRunId && runs.some((r) => r.id === run.parentRunId))
                  .map((run) => ({ from: run.parentRunId!, to: run.id }))
        }
      />
      <details open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
        <summary>{label('List and details', '列表与详情')}</summary>
        {tab === 'agents' && (
          <div className="team-relation-tree">
            <p className="muted">
              {label(
                'Indentation shows delegation, not task dependencies. Select a member to filter their activity below.',
                '缩进表示委派上下级，不代表任务先后。点击成员可筛选下方工作记录。',
              )}
            </p>
            {rows.slice(0, limit).map(({ run, level, missingParent }) => (
              <button
                key={run.id}
                className="team-relation-node"
                style={{ marginInlineStart: Math.min(level, 5) * 16 }}
                onClick={() => member(run.id)}
              >
                <span className="team-relation-branch">{level ? '↳' : '●'}</span>
                <span className="team-relation-name">
                  <strong>{name(run.id)}</strong>
                  <small>
                    {detail.teamMembers?.find((m) => m.runId === run.id)?.role ||
                      (run.parentRunId
                        ? label('Delegated agent', '子 Agent')
                        : label('Root agent', '主 Agent'))}
                    {missingParent && label(' · parent not loaded', ' · 上级记录未加载')}
                    {level > 5 && ' · ' + label('Depth ', '层级 ') + level}
                  </small>
                </span>
                <span className="pill">{status(run.status)}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'tasks' && (
          <div className="team-relation-tasks">
            <p className="muted">
              {label(
                'Arrows point from prerequisites to the task. Only declared dependencies are shown.',
                '箭头由前置任务指向后续任务；只展示已声明的依赖，不推测隐藏关系。',
              )}
            </p>
            {!tasks.length && (
              <p>{label('No task dependencies have been declared.', '尚未声明任务及依赖。')}</p>
            )}
            {tasks.slice(0, limit).map((task) => (
              <div className="team-relation-task" key={task.id}>
                <div className="team-relation-prereqs">
                  {task.dependsOn.length ? (
                    task.dependsOn.map((id) => (
                      <button key={id} onClick={() => setTaskId(id)}>
                        {tasks.find((t) => t.id === id)?.title ||
                          label('Missing task', '任务记录缺失')}
                      </button>
                    ))
                  ) : (
                    <small>{label('No prerequisites', '无前置任务')}</small>
                  )}
                </div>
                <ArrowRight size={16} />
                <button
                  className="team-relation-name"
                  aria-pressed={taskId === task.id}
                  onClick={() => setTaskId(task.id)}
                >
                  <strong>{task.title}</strong>
                  <small>
                    {status(task.status)} ·{' '}
                    {task.owner ? name(task.owner) : label('Unassigned', '待分配')}
                  </small>
                </button>
              </div>
            ))}
            {chosen && (
              <div className="team-relation-inspect">
                <strong>{chosen.title}</strong>
                <p>{chosen.acceptance}</p>
                {chosen.note && <p>{chosen.note}</p>}
                {chosen.owner && (
                  <button onClick={() => member(chosen.owner!)}>
                    {label('View owner activity', '查看负责人工作记录')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {tab === 'messages' && (
          <div>
            <p className="muted">
              {label(
                'Recorded submissions only; this does not imply receipt or reading. Older direct messages without structured records are not reconstructed.',
                '显示已记录的消息提交，不等于对方已接收或已读。旧的私信缺少结构化记录时不补猜。',
              )}
            </p>
            {!edges.length && (
              <p>{label('No recorded communication edges yet.', '暂无已记录的成员通信。')}</p>
            )}
            {edges.slice(0, limit).map((edge) => (
              <div className="team-relation-message" key={edge.from + edge.to + edge.kind}>
                <button onClick={() => member(edge.from)}>{name(edge.from)}</button>
                <ArrowRight size={15} />
                <button onClick={() => member(edge.to)}>{name(edge.to)}</button>
                <small>
                  {edge.kind === 'direct'
                    ? label('Direct submissions', '私信提交')
                    : label('Team discussion', '团队讨论')}{' '}
                  · {edge.count}
                </small>
              </div>
            ))}
          </div>
        )}
        {(tab === 'agents' ? rows.length : tab === 'tasks' ? tasks.length : edges.length) > 30 && (
          <button onClick={() => setExpanded((v) => !v)}>
            {expanded ? label('Show less', '收起列表') : label('Show all', '显示全部')}
          </button>
        )}
      </details>
    </div>
  );
}
