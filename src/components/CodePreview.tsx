import { useEffect, useState, type ReactNode } from 'react';
import { previewDocument } from '../markdown-rich';

export function CodePreview({
  source,
  language = 'html',
  code,
}: {
  source: string;
  language?: string;
  code?: ReactNode;
}) {
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const [version, setVersion] = useState(0);
  const [size, setSize] = useState('440');
  const [ready, setReady] = useState('');
  const [diagram, setDiagram] = useState('');
  const [error, setError] = useState('');
  const isDiagram = language === 'mermaid';
  useEffect(() => {
    const timer = setTimeout(() => setReady(source), 450);
    return () => clearTimeout(timer);
  }, [source]);
  useEffect(() => {
    if (!isDiagram || !ready) return;
    let cancelled = false;
    setDiagram('');
    setError('');
    if (ready.length > 50000) {
      setError('图表过大，请查看代码 / Diagram too large; view code.');
      return;
    }
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          maxTextSize: 50000,
          maxEdges: 500,
          suppressErrorRendering: true,
          theme: 'default',
        });
        const { svg } = await mermaid.render('diagram-' + crypto.randomUUID(), ready);
        if (!cancelled) setDiagram('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      })
      .catch(() => {
        if (!cancelled)
          setError(
            '图表暂时无法解析；生成完成后重试，或切换代码检查语法。 / Diagram cannot be parsed yet; retry or inspect the code.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [isDiagram, ready, version]);
  return (
    <div className="inline-preview">
      <div className="preview-actions">
        <div role="group" aria-label="显示方式 / View mode">
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            预览 / Preview
          </button>
          <button type="button" aria-pressed={mode === 'code'} onClick={() => setMode('code')}>
            代码 / Code
          </button>
        </div>
        <label>
          高度 / Height{' '}
          <select
            aria-label="预览高度 / Preview height"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            <option value="300">紧凑 / Compact</option>
            <option value="440">标准 / Standard</option>
            <option value="640">宽敞 / Tall</option>
          </select>
        </label>
        <button type="button" onClick={() => setVersion((v) => v + 1)}>
          重置 / Reset
        </button>
        <small>
          {isDiagram ? 'Mermaid · 本地图表 / Local diagram' : 'HTML · 隔离页面 / Sandboxed'}
        </small>
      </div>
      <div className="preview-stage" style={{ height: Number(size) }}>
        <div className="preview-pane" hidden={mode !== 'preview'}>
          {isDiagram ? (
            error ? (
              <p role="status">{error}</p>
            ) : diagram ? (
              <img className="diagram-image" src={diagram} alt="关系图 / Diagram" />
            ) : (
              <p role="status">正在绘制 / Rendering…</p>
            )
          ) : ready ? (
            <iframe
              key={version}
              title="Interactive HTML preview"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={previewDocument(ready)}
            />
          ) : (
            <p>正在准备预览 / Preparing preview…</p>
          )}
        </div>
        <div className="preview-pane preview-code" hidden={mode !== 'code'}>
          <pre>{code || <code>{source}</code>}</pre>
        </div>
      </div>
    </div>
  );
}
