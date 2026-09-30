import { useEffect, useState } from 'react';
export function DisplaySettings({ zh = false }: { zh?: boolean }) {
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('agentdemo.displaySize');
    return ['auto', '100', '115', '125', '150'].includes(saved || '') ? saved! : 'auto';
  });
  useEffect(() => {
    localStorage.setItem('agentdemo.displaySize', size);
    if (size === 'auto') document.documentElement.style.removeProperty('--ui-font-size');
    else
      document.documentElement.style.setProperty(
        '--ui-font-size',
        String((16 * Number(size)) / 100) + 'px',
      );
  }, [size]);
  return (
    <label className="display-settings">
      <span aria-hidden="true">Aa</span>
      <select
        aria-label={zh ? '界面字号' : 'Interface text size'}
        value={size}
        onChange={(e) => setSize(e.target.value)}
      >
        <option value="auto">{zh ? '自动字号' : 'Auto size'}</option>
        <option value="100">100% · 16px</option>
        <option value="115">115% · 18px</option>
        <option value="125">125% · 20px</option>
        <option value="150">150% · 24px</option>
      </select>
    </label>
  );
}
