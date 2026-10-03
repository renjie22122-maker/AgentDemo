import { useState } from 'react';
import { previewDocument } from '../markdown-rich';
export function CodePreview({ source }: { source: string }) {
  const [open, setOpen] = useState(false),
    [version, setVersion] = useState(0);
  return (
    <div className="inline-preview">
      <div className="preview-actions">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '关闭预览 / Close' : '交互预览 / Preview'}
        </button>
        {open && (
          <button type="button" onClick={() => setVersion(version + 1)}>
            重置 / Reset
          </button>
        )}
        <small>HTML · 隔离页面 / Sandboxed</small>
      </div>
      {open && (
        <iframe
          key={version}
          title="Interactive HTML preview"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={previewDocument(source)}
        />
      )}
    </div>
  );
}
