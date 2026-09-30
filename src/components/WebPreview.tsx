import { useEffect, useState } from 'react';
import { api } from '../api';
export function WebPreview({
  id,
  path,
  source,
  zh,
}: {
  id: string;
  path: string;
  source: string;
  zh: boolean;
}) {
  const [html, setHtml] = useState(''),
    [error, setError] = useState(''),
    [wide, setWide] = useState(false);
  useEffect(() => {
    let active = true;
    setHtml('');
    setError('');
    const base = 'https://preview.invalid/' + path;
    function local(ref: string) {
      const u = new URL(ref, base),
        root = '/' + path.split('/')[0] + '/';
      if (u.origin !== 'https://preview.invalid' || !u.pathname.startsWith(root))
        throw new Error('External or out-of-folder resource: ' + ref);
      return decodeURIComponent(u.pathname.slice(1));
    }
    void (async () => {
      const template = document.createElement('template');
      template.innerHTML = source;
      const resources = template.content.querySelectorAll(
        'script[src],link[rel=stylesheet],img[src]',
      );
      if (resources.length > 40) throw new Error('Preview supports at most 40 local resources.');
      for (const node of resources) {
        const ref = node.getAttribute(node.tagName === 'LINK' ? 'href' : 'src') || '';
        if (node.tagName === 'IMG' && ref.startsWith('data:image/')) continue;
        const name = local(ref);
        if (node.tagName === 'IMG') {
          const asset = await api(
            '/conversations/' + id + '/files?view=asset&path=' + encodeURIComponent(name),
          );
          node.setAttribute('src', asset.data);
          node.removeAttribute('srcset');
          continue;
        }
        const asset = await api(
          '/conversations/' + id + '/files?view=text&path=' + encodeURIComponent(name),
        );
        if (node.tagName === 'LINK') {
          const style = document.createElement('style');
          style.textContent = asset.text;
          node.replaceWith(style);
        } else {
          node.removeAttribute('src');
          node.textContent = asset.text;
        }
      }
      template.content.querySelectorAll('base,meta[http-equiv]').forEach((n) => n.remove());
      const csp =
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      if (active)
        setHtml(
          '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
            csp +
            '"></head><body>' +
            template.innerHTML +
            '</body></html>',
        );
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [id, path, source]);
  useEffect(() => {
    if (!wide) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWide(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [wide]);
  return (
    <div className={wide ? 'web-preview expanded' : 'web-preview'}>
      <div className="preview-actions">
        <button onClick={() => setWide(!wide)}>
          {wide ? (zh ? '收起预览' : 'Collapse preview') : zh ? '放大预览' : 'Expand preview'}
        </button>
        <span>{zh ? '隔离预览' : 'Sandboxed preview'}</span>
      </div>
      <p className="inspection-note">
        {zh
          ? '支持本地 HTML、脚本、样式和常见图片。外部资源、模块导入及依赖开发服务器的功能不可用。'
          : 'Local HTML, scripts, styles and common images. External resources, module imports and development-server features are unavailable.'}
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : html ? (
        <iframe
          title={zh ? '生成网页预览' : 'Generated web preview'}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      ) : (
        <p>{zh ? '正在准备预览…' : 'Preparing preview…'}</p>
      )}
    </div>
  );
}
