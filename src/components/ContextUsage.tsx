export function ContextUsage({ data, zh }: { data: any; zh: boolean }) {
  const b = data.budget,
    tokens = b?.tokens || 0,
    capacity = b?.capacity || 0,
    threshold = b?.threshold || 0,
    percent = capacity ? (tokens / capacity) * 100 : 0;
  const label =
    b?.method === 'measured'
      ? zh
        ? 'API 实测'
        : 'API measured'
      : b?.method === 'calibrated'
        ? zh
          ? 'API 校准估算（包含新增内容）'
          : 'API-calibrated estimate including new content'
        : zh
          ? '本地估算（尚无有效实测）'
          : 'Local estimate; no valid measurement yet';
  return (
    <section className="context-usage">
      <strong>{zh ? '上下文用量' : 'Context usage'}</strong>
      <p>{label}</p>
      <b>
        {tokens.toLocaleString()} / {capacity.toLocaleString()} tokens · {percent.toFixed(1)}%
      </b>
      <div
        className="context-usage-track"
        role="meter"
        aria-label={zh ? '上下文 token 占用' : 'Context token usage'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
      >
        <span style={{ width: Math.min(100, percent) + '%' }} />
        {capacity > 0 && <i style={{ left: Math.min(100, (threshold / capacity) * 100) + '%' }} />}
      </div>
      <p>
        {zh ? '红线：压缩阈值' : 'Red marker: compaction threshold'} {threshold.toLocaleString()}{' '}
        tokens ({capacity ? ((threshold / capacity) * 100).toFixed(1) : 0}%)
      </p>
      <small>
        {zh ? '已预留输出与安全余量' : 'Output and safety reserve'}:{' '}
        {((b?.reserve || 0) + (b?.margin || 0)).toLocaleString()} tokens.{' '}
        {zh
          ? '新增内容、工具定义和图片计入估算。达到红线后在下一次请求前尝试压缩；估算不是精确 tokenizer 计数。'
          : 'New content, tool definitions and images are estimated. Compression is attempted before the next request at the red marker. Estimates are not exact tokenizer counts.'}
      </small>
    </section>
  );
}
