import { GitFork, UserRound, Network, Check } from 'lucide-react';
import { ControlPopover } from './ControlPopover';
export function DelegationControl({
  value,
  disabled,
  onChange,
  zh = false,
  depth,
  total,
  parallel,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  zh?: boolean;
  depth: number;
  total: number;
  parallel: number;
}) {
  const options = [
    {
      id: 'off',
      icon: <UserRound size={18} />,
      name: zh ? '单 Agent' : 'Single agent',
      description: zh
        ? '由当前 Agent 完成，不创建子 Agent。'
        : 'The current agent handles the task without creating subagents.',
    },
    {
      id: 'auto',
      icon: <GitFork size={18} />,
      name: zh ? '自动协作' : 'Automatic',
      description: zh
        ? 'Agent 判断是否值得拆分，简单任务直接完成。'
        : 'Delegate when independent work is useful; keep simple tasks together.',
    },
    {
      id: 'prefer',
      icon: <Network size={18} />,
      name: zh ? '优先协作' : 'Prefer collaboration',
      description: zh
        ? '优先寻找可并行的独立工作，不强制拆分每个任务。'
        : 'Look for useful parallel work without forcing every task into a team.',
    },
  ];
  const selected = options.find((o) => o.id === value) || options[1];
  return (
    <ControlPopover
      label={(zh ? '协作' : 'Team') + ' · ' + selected.name}
      icon={<GitFork size={16} />}
      disabled={disabled}
    >
      <header className="control-heading">
        <strong>{zh ? '子 Agent 协作' : 'Subagent collaboration'}</strong>
      </header>
      <p className="control-description">
        {zh
          ? '主 Agent 可把独立工作交给子 Agent，再汇总结果。'
          : 'The main agent can delegate independent work and bring the results together.'}
      </p>
      <div
        className="delegation-options"
        role="radiogroup"
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
            e.preventDefault();
            const current = options.findIndex((o) => o.id === value),
              step = ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1;
            const next = (current + step + options.length) % options.length;
            onChange(options[next].id);
            (e.currentTarget.querySelectorAll('button')[next] as HTMLElement)?.focus();
          }
        }}
        aria-label={zh ? '协作策略' : 'Team strategy'}
      >
        {options.map((o) => (
          <button
            type="button"
            role="radio"
            key={o.id}
            aria-checked={value === o.id}
            className={'delegation-option' + (value === o.id ? ' selected' : '')}
            onClick={() => onChange(o.id)}
          >
            <span className="delegation-icon">{o.icon}</span>
            <span className="delegation-copy">
              <strong>
                {o.name}
                {o.id === 'auto' && <em>{zh ? '推荐' : 'Recommended'}</em>}
              </strong>
              <small>{o.description}</small>
            </span>
            <span className="delegation-check">{value === o.id && <Check size={16} />}</span>
          </button>
        ))}
      </div>
      <footer className="control-note">
        <div>
          {zh
            ? `最多委派 ${depth} 层 · 子任务累计 ${total} 个 · 模型并发 ${parallel}`
            : `Depth ${depth} · ${total} children per run tree · ${parallel} model requests at once`}
        </div>
        <div>
          {zh
            ? '子 Agent 使用独立上下文，会增加用量；可写副本合并仍需你批准。'
            : 'Subagents have separate context and add usage. Merging writable copies still needs your approval.'}
        </div>
      </footer>
    </ControlPopover>
  );
}
