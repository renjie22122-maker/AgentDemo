import { useState } from 'react';
import { classifySkill, skillCategories } from '../../shared/skill-categories';
export function SkillPicker({
  skills,
  selected,
  onChange,
  onDelete,
  disabled = false,
  zh = false,
}: {
  skills: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    sourceGroup?: string;
    categories?: Array<{ id: string; labelEn: string; labelZh: string }>;
  }>;
  selected: string[];
  onChange?: (ids: string[]) => void;
  onDelete?: (id: string) => void;
  disabled?: boolean;
  zh?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [selection, setSelection] = useState(''),
    [source, setSource] = useState('');
  const categoryLabels = new Map<string, string>(skillCategories.map(([id, label]) => [id, label]));
  for (const s of skills)
    for (const c of s.categories || []) categoryLabels.set(c.id, zh ? c.labelZh : c.labelEn);
  const visible = skills.filter(
    (s) =>
      (s.name + ' ' + s.description).toLowerCase().includes(query.toLowerCase()) &&
      (!source || (s.sourceGroup || 'Other') === source) &&
      (!category || classifySkill(s).includes(category)) &&
      (!selection ||
        (selection === 'selected' ? selected.includes(s.id) : !selected.includes(s.id))),
  );
  return (
    <div className="skill-browser">
      <input
        aria-label={zh ? '搜索技能' : 'Search skills'}
        placeholder={zh ? '搜索名称或用途' : 'Search name or purpose'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        aria-label={zh ? '技能分类' : 'Skill category'}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">{zh ? '全部分类' : 'All categories'}</option>
        {[...categoryLabels].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
        <option value="other">{zh ? '其他' : 'Other'}</option>
      </select>
      <select
        aria-label={zh ? '技能来源' : 'Skill source'}
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        <option value="">{zh ? '全部来源' : 'All sources'}</option>
        {[...new Set(skills.map((s) => s.sourceGroup || 'Other'))].sort().map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {onChange && (
        <>
          <select
            aria-label={zh ? '选择状态' : 'Selection status'}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">{zh ? '全部状态' : 'All selections'}</option>
            <option value="selected">{zh ? '已选择' : 'Selected'}</option>
            <option value="unselected">{zh ? '未选择' : 'Unselected'}</option>
          </select>
          <div className="row">
            <button
              disabled={disabled}
              onClick={() =>
                onChange([
                  ...new Set([...selected, ...visible.filter((s) => s.enabled).map((s) => s.id)]),
                ])
              }
            >
              {zh ? '选择筛选结果' : 'Select filtered'}
            </button>
            <button
              disabled={disabled}
              onClick={() => onChange(selected.filter((id) => !visible.some((s) => s.id === id)))}
            >
              {zh ? '取消筛选结果' : 'Clear filtered'}
            </button>
            <button disabled={disabled || !selected.length} onClick={() => onChange([])}>
              {zh ? '全部取消' : 'Clear all'}
            </button>
          </div>
        </>
      )}
      <small>
        {visible.length} / {skills.length}
        {onChange ? ' · ' + selected.length + (zh ? ' 已选择' : ' selected') : ''}
      </small>
      <div className="skill-options">
        {visible.map((s) => (
          <label className="checkbox" key={s.id}>
            {onChange && (
              <input
                type="checkbox"
                disabled={disabled || !s.enabled}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...new Set([...selected, s.id])]
                      : selected.filter((id) => id !== s.id),
                  )
                }
              />
            )}
            <span title={s.description}>
              {s.name}
              <small>
                {classifySkill(s)
                  .map((id) => categoryLabels.get(id) || id)
                  .join(' · ')}
              </small>
              {onDelete && <small>{s.description}</small>}
            </span>
            {onDelete && (
              <button
                disabled={disabled}
                onClick={() => onDelete(s.id)}
                aria-label={(zh ? '删除 ' : 'Delete ') + s.name}
              >
                {zh ? '删除' : 'Delete'}
              </button>
            )}
          </label>
        ))}
      </div>
      <small className="muted">
        {zh
          ? '分类按名称和描述自动推断，可同时属于多类；不代表能力已验证。'
          : 'Categories are inferred from names/descriptions, may overlap, and do not certify capabilities.'}
      </small>
    </div>
  );
}
