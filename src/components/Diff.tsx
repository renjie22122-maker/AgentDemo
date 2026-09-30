import { useMemo, useState } from 'react';
import { diffLines } from 'diff';
export function Diff({ data }: { data: any }) {
  const [split, setSplit] = useState(false);
  const rows = useMemo(() => {
    const parts = diffLines(data.before || '', data.after || '', {
      timeout: 100,
      maxEditLength: 3000,
    });
    if (!parts) return null;
    let old = 0,
      next = 0;
    return parts.flatMap((part) => {
      const lines = part.value.split('\n');
      if (lines.at(-1) === '') lines.pop();
      return lines.map((text) => ({
        text,
        kind: part.added ? 'add' : part.removed ? 'remove' : 'same',
        old: part.added ? null : ++old,
        next: part.removed ? null : ++next,
      }));
    });
  }, [data.before, data.after]);
  const added = rows?.filter((r) => r.kind === 'add').length || 0,
    removed = rows?.filter((r) => r.kind === 'remove').length || 0;
  return (
    <details className="file-diff">
      <summary>
        <span className="diff-path">{data.path}</span>
        <span className="diff-count-add">+{added}</span>
        <span className="diff-count-remove">−{removed}</span>
      </summary>
      {data.note ? (
        <p>{data.note}</p>
      ) : !rows ? (
        <p>
          Large change: line alignment unavailable. Open the file to inspect the complete version.
        </p>
      ) : (
        <>
          <div className="diff-toolbar">
            <button aria-pressed={!split} onClick={() => setSplit(false)}>
              Unified / 合并
            </button>
            <button aria-pressed={split} onClick={() => setSplit(true)}>
              Before / After · 前后对比
            </button>
          </div>
          <div
            className={'diff-code ' + (split ? 'diff-split' : '')}
            role="table"
            aria-label="File changes"
          >
            {split && (
              <div className="diff-head">
                <span>Before · 修改前</span>
                <span>After · 修改后</span>
              </div>
            )}
            {rows.map((r, i) =>
              split ? (
                <div key={i} className="diff-pair" role="row">
                  <div
                    className={
                      r.kind === 'add'
                        ? 'diff-empty'
                        : r.kind === 'remove'
                          ? 'diff-line remove'
                          : 'diff-line same'
                    }
                  >
                    <span className="diff-number">{r.old ?? ''}</span>
                    <code>{r.kind === 'add' ? '' : r.text || ' '}</code>
                  </div>
                  <div
                    className={
                      r.kind === 'remove'
                        ? 'diff-empty'
                        : r.kind === 'add'
                          ? 'diff-line add'
                          : 'diff-line same'
                    }
                  >
                    <span className="diff-number">{r.next ?? ''}</span>
                    <code>{r.kind === 'remove' ? '' : r.text || ' '}</code>
                  </div>
                </div>
              ) : (
                <div key={i} role="row" className={'diff-line ' + r.kind}>
                  <span className="diff-number">{r.old ?? ''}</span>
                  <span className="diff-number">{r.next ?? ''}</span>
                  <span className="diff-sign">
                    {r.kind === 'add' ? '+' : r.kind === 'remove' ? '−' : ' '}
                  </span>
                  <code>{r.text || ' '}</code>
                </div>
              ),
            )}
          </div>
        </>
      )}
    </details>
  );
}

export function DiffGroup({ events, zh }: { events: any[]; zh: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const changes = events.filter((e) => e.type === 'file.changed'),
    files = new Set(changes.map((e) => e.data.path));
  const notes = [
    ...new Set(events.filter((e) => e.type === 'file.changes-limited').map((e) => e.data.note)),
  ];
  return (
    <details
      className="diff-group"
      onToggle={(e) => {
        if (e.target === e.currentTarget) setExpanded(e.currentTarget.open);
      }}
    >
      <summary>
        <span>
          {zh ? '文件改动' : 'File changes'} · {files.size} {zh ? '个文件' : 'files'} ·{' '}
          {changes.length} {zh ? '次修改' : 'changes'}
        </span>
        <small>{zh ? '展开 / 收起' : 'Expand / collapse'}</small>
      </summary>
      <div className="diff-group-body">
        {expanded && changes.map((e) => <Diff key={e.id} data={e.data} />)}
        {notes.map((note, i) => (
          <p key={i} className="muted">
            {note}
          </p>
        ))}
      </div>
    </details>
  );
}
