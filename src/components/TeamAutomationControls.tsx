import { useEffect, useState } from 'react';
import { api } from '../api';
export function TeamAutomationControls({
  id,
  policy,
  recovery,
  events,
  zh,
  action,
}: {
  id: string;
  policy: any;
  recovery: any[];
  events: any[];
  zh: boolean;
  action: (fn: () => Promise<any>) => Promise<any>;
}) {
  const [draft, setDraft] = useState<any>(
    policy || {
      enabled: false,
      autoRecover: false,
      autoScale: false,
      autoElect: false,
      maxWorkers: 2,
      maxNewWorkers: 4,
      maxRecoveries: 1,
      idleSeconds: 60,
      costLimitUsd: null,
    },
  );
  useEffect(
    () =>
      setDraft(
        policy || {
          enabled: false,
          autoRecover: false,
          autoScale: false,
          autoElect: false,
          maxWorkers: 2,
          maxNewWorkers: 4,
          maxRecoveries: 1,
          idleSeconds: 60,
          costLimitUsd: null,
        },
      ),
    [id, JSON.stringify(policy)],
  );
  const check = (key: string, label: string) => (
    <label key={key}>
      <input
        type="checkbox"
        checked={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <details className="notice">
      <summary>
        {zh ? '恢复与自动调度' : 'Recovery and automation'} ·{' '}
        {policy?.enabled ? (zh ? '已启用' : 'Enabled') : zh ? '未启用' : 'Disabled'}
      </summary>
      <div className="row">
        {check('enabled', zh ? '启用宿主自动化' : 'Enable host automation')}
        {check('autoRecover', zh ? '只读成员自动恢复' : 'Auto-recover read-only members')}
        {check('autoScale', zh ? '有上限的扩缩容' : 'Bounded autoscaling')}
        {check('autoElect', zh ? '主持角色自动接管' : 'Automatic coordinator takeover')}
      </div>
      <p>
        {zh
          ? '扩容只创建只读成员，仍受全局并发与深度限制。权限不随角色变化。未知操作不重放；手动停止的成员不会自动重启。费用阈值阻止新增与恢复，不中断已运行的请求。'
          : 'Scaling creates read-only workers and respects global concurrency/depth limits. Roles do not change permissions. Unknown operations are not replayed; manually stopped members stay stopped. The cost threshold blocks new starts and recovery, not in-flight requests.'}
      </p>
      <div className="row">
        {[
          ['maxWorkers', zh ? '活跃工作者上限' : 'Active worker limit', 1, 16],
          ['maxNewWorkers', zh ? '累计新增上限' : 'Total new workers', 0, 32],
          ['maxRecoveries', zh ? '每成员自动恢复次数' : 'Auto-recoveries per member', 0, 5],
          ['idleSeconds', zh ? '空闲收缩秒数' : 'Idle retirement seconds', 10, 3600],
        ].map(([key, label, min, max]) => (
          <label key={key}>
            {label}
            <input
              style={{ width: 90 }}
              type="number"
              min={Number(min)}
              max={Number(max)}
              value={draft[String(key)]}
              onChange={(e) => setDraft({ ...draft, [String(key)]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label>
          {zh ? '新增费用门槛 USD（空白不限）' : 'Start cost threshold USD (blank = none)'}
          <input
            style={{ width: 110 }}
            type="number"
            min="0.001"
            step="0.01"
            value={draft.costLimitUsd ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                costLimitUsd: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <button onClick={() => void action(() => api('/runs/' + id + '/team-automation', draft))}>
        {zh ? '保存自动化策略' : 'Save automation policy'}
      </button>
      {recovery
        .filter((r) => ['interrupted', 'failed'].includes(r.status))
        .map((r) => (
          <div className="notice" key={r.runId}>
            <code>{r.runId}</code>
            <p>
              {r.blockers.join('; ') ||
                (zh
                  ? '可从已保存结果继续；不会直接重放旧调用。'
                  : 'Can continue from recorded outcomes without replaying old calls.')}
            </p>
            <button
              onClick={() =>
                void action(() => api('/runs/' + r.runId + '/team-recovery-check', {}))
              }
            >
              {zh ? '仅核对现有结果' : 'Inspect existing outcomes'}
            </button>
            <button
              disabled={!r.eligible}
              onClick={() => void action(() => api('/runs/' + r.runId + '/team-recover', {}))}
            >
              {zh ? '核对并恢复此成员' : 'Inspect and resume member'}
            </button>
          </div>
        ))}
      {!!events.length && (
        <details>
          <summary>{zh ? '自动化记录' : 'Automation history'}</summary>
          {events.map((e) => (
            <pre key={e.id}>{e.action + ' ' + JSON.stringify(e.data)}</pre>
          ))}
        </details>
      )}
    </details>
  );
}
