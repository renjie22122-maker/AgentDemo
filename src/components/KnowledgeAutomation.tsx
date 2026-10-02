import { useEffect, useState } from 'react';
import { api } from '../api';
export function KnowledgeAutomation({ scope, zh, embedding, notify, profile }: any) {
  const [value, setValue] = useState<any>(null),
    [paths, setPaths] = useState(''),
    [busy, setBusy] = useState(false);
  const [graph, setGraph] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      scope &&
      api('/knowledge/maintenance?scope=' + encodeURIComponent(scope))
        .then((v) => {
          if (alive) setValue(v);
        })
        .catch((e: any) => {
          if (alive) notify(e.message);
        });
    setValue(null);
    setPaths('');
    if (scope)
      api('/knowledge/maintenance?scope=' + encodeURIComponent(scope))
        .then((v: any) => {
          if (alive) {
            setValue(v);
            setPaths(v.paths.join('\n'));
            setGraph(!!v.graphProfileId);
          }
        })
        .catch((e: any) => {
          if (alive) notify(e.message);
        });
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [scope]);
  const save = async (enabled: boolean) => {
    const previous = value;
    setValue({ ...value, enabled });
    setBusy(true);
    try {
      setValue(
        await api('/knowledge/maintenance', {
          scope,
          enabled,
          graphProfileId: graph ? profile?.id : undefined,
          paths: paths
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      );
    } catch (e: any) {
      setValue(previous);
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!scope || !value) return null;
  return (
    <section className="panel">
      <h3>{zh ? '自动维护知识库' : 'Automatic knowledge maintenance'}</h3>
      <p className="muted">
        {embedding.backend === 'local'
          ? zh
            ? '本地多语言 E5 · 中文 / English；首次下载模型，文档不上传。'
            : 'Local multilingual E5 · model download on first use; no document upload.'
          : (zh
              ? '开启即允许将本范围文档发送到：'
              : 'Enabling authorizes embedding documents in this scope at: ') + embedding.baseUrl}
      </p>
      {scope.startsWith('project:') && (
        <label>
          {zh
            ? '登记资料文件或文件夹，每行一个项目内绝对路径'
            : 'Source files/folders: one absolute path within this project per line'}
          <textarea
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
            placeholder={
              zh
                ? '留空只维护已导入文档；不扫描整个项目'
                : 'Leave blank to index imported documents only'
            }
          />
        </label>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={graph}
          disabled={!profile || busy}
          onChange={(e) => setGraph(e.target.checked)}
        />
        {zh
          ? '自动提取文档实体关系（发送正文片段到：'
          : 'Extract document relations (send excerpts to: '}
        {profile?.baseUrl || '—'}
        {')'}
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={busy}
          onChange={(e) => void save(e.target.checked)}
        />
        {zh ? '开启自动更新与索引' : 'Automatically update and index'}
      </label>
      <button disabled={busy} onClick={() => void save(value.enabled)}>
        {zh ? '保存范围 / 重试' : 'Save sources / retry'}
      </button>
      <p role="status">
        {zh ? '状态：' : 'Status: '}
        {value.status}
        {value.updatedAt ? ' · ' + new Date(value.updatedAt).toLocaleString() : ''}
      </p>
      {value.error && <p role="alert">{value.error}</p>}
      <small>
        {zh
          ? '每 30 秒检查。支持 TXT、Markdown、CSV、JSON、DOCX、XLSX、文本 PDF 等；跳过隐藏文件与构建目录；图片与扫描 PDF 使用本机 Windows OCR。临时网络故障退避重试；配置错误 3 次后暂停，移除源文件会使当前版本退出检索。'
          : 'Checks every 30 seconds. Text, Markdown, CSV, JSON, DOCX, XLSX and text PDFs. Hidden/build folders excluded; Windows OCR handles images/scanned PDFs. Transient network errors retry with backoff; configuration errors pause after three attempts; removed files leave current retrieval.'}
      </small>
    </section>
  );
}
