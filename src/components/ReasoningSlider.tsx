import { useEffect, useState, type CSSProperties } from 'react';
import { Brain } from 'lucide-react';
import { ControlPopover } from './ControlPopover';
const order = ['auto', 'none', 'low', 'medium', 'high', 'max'];
const names: Record<string, [string, string]> = {
  auto: ['Auto', '自动'],
  none: ['Off', '关闭'],
  low: ['Light', '轻量'],
  medium: ['Standard', '标准'],
  high: ['Deep', '深入'],
  max: ['Maximum', '充分'],
};
const descriptions: Record<string, [string, string]> = {
  auto: ['Use the model’s default reasoning setting.', '使用当前模型的默认推理设置。'],
  none: ['Request no additional reasoning from this model.', '请求模型关闭额外推理。'],
  low: [
    'A lighter reasoning effort for straightforward tasks.',
    '较轻的推理强度，适合直接、简单的问题。',
  ],
  medium: ['A balanced reasoning effort for everyday work.', '均衡的推理强度，适合日常任务。'],
  high: [
    'More reasoning effort for complex analysis and decisions.',
    '更充分地推理，适合复杂分析与判断。',
  ],
  max: [
    'The highest reasoning level declared for this connection.',
    '使用当前连接声明支持的最高推理强度。',
  ],
};
export function ReasoningSlider({
  value,
  efforts,
  disabled,
  onChange,
  label,
  zh = false,
}: {
  value: string;
  efforts: string[];
  disabled: boolean;
  onChange: (v: string) => void;
  label: string;
  zh?: boolean;
}) {
  const choices = order.filter((x) => efforts.includes(x));
  if (!choices.length) choices.push('auto');
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const index = Math.max(0, choices.indexOf(draft)),
    selected = choices[index],
    lang = zh ? 1 : 0;
  const choose = (v: string) => {
    setDraft(v);
    if (v !== value) onChange(v);
  };
  return (
    <ControlPopover
      label={(zh ? '思考' : 'Thinking') + ' · ' + names[value in names ? value : 'auto'][lang]}
      icon={<Brain size={16} />}
      disabled={disabled}
    >
      <header className="control-heading">
        <strong>{zh ? '推理强度' : 'Reasoning effort'}</strong>
        <span className="control-value">{names[selected][lang]}</span>
      </header>
      <p className="control-description" aria-live="polite">
        {descriptions[selected][lang]}
      </p>
      <div className="effort-track">
        <input
          type="range"
          aria-label={label}
          aria-valuetext={names[selected][lang]}
          min={0}
          max={Math.max(0, choices.length - 1)}
          step={1}
          value={index}
          disabled={choices.length === 1}
          style={
            {
              '--range-fill': (choices.length > 1 ? (index / (choices.length - 1)) * 100 : 0) + '%',
            } as CSSProperties
          }
          onChange={(e) => setDraft(choices[Number(e.target.value)])}
          onPointerUp={(e) => choose(choices[Number(e.currentTarget.value)])}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key))
              choose(choices[Number(e.currentTarget.value)]);
          }}
        />
        <div className="effort-stops">
          {choices.map((v, i) => (
            <button type="button" key={v} aria-pressed={selected === v} onClick={() => choose(v)}>
              <i className={i <= index ? 'filled' : ''} />
              <span>{names[v][lang]}</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="control-note">
        {choices.length === 1
          ? zh
            ? '此连接目前只声明了一个可用档位。'
            : 'This connection declares only one available level.'
          : zh
            ? '强度更高可能增加等待时间和用量，不保证每个任务都更好。只显示此模型已配置的档位。'
            : 'Higher effort may take more time and tokens; it is not always better. Only configured model levels are shown.'}
      </footer>
    </ControlPopover>
  );
}
