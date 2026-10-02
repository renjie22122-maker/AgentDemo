import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
export function KnowledgeAutomation({ scope, zh, embedding, notify, profile, project }: any) {
  const [value, setValue] = useState<any>(null),
    [paths, setPaths] = useState(''),
    [busy, setBusy] = useState(false);
  const picker = useRef<AbortController | null>(null);
  const [picking, setPicking] = useState(false);
  const addPaths = (added: string[]) =>
    setPaths((old) =>
      [
        ...new Set([
          ...old
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean),
          ...added,
        ]),
      ].join('\n'),
    );
  useEffect(() => () => picker.current?.abort(), [scope]);
  const browse = async () => {
    const controller = new AbortController();
    picker.current = controller;
    setPicking(true);
    try {
      const result = await api('/pick-folder', {}, 'POST', {}, controller.signal);
      if (!controller.signal.aborted) addPaths(result.paths || (result.path ? [result.path] : []));
    } catch (e: any) {
      if (!controller.signal.aborted) notify(e.message);
    } finally {
      if (picker.current === controller) {
        picker.current = null;
        setPicking(false);
      }
    }
  };
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
    setPicking(false);
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
      <h3>{zh ? '文件夹导入与自动维护' : 'Folder import and automatic maintenance'}</h3>
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
      {scope.startsWith('project:') && (
        <div className="row wrap">
          <button disabled={busy || picking} onClick={() => void browse()}>
            {zh ? '选择资料文件夹…' : 'Choose source folders…'}
          </button>
          {picking && (
            <button
              onClick={() => {
                picker.current?.abort();
                setPicking(false);
              }}
            >
              {zh ? '取消选择' : 'Cancel selection'}
            </button>
          )}
          {!!project?.folders?.length && (
            <button disabled={busy} onClick={() => addPaths(project.folders)}>
              {zh ? '添加此项目的文件夹' : 'Add project folders'}
            </button>
          )}
          <small>
            {zh
              ? '递归包含子文件夹；可填写多个路径（最多 12 个）。项目外资料请先在管理项目中添加其文件夹。保存并开启后后台导入。'
              : 'Includes subfolders recursively; up to 12 source paths. Add external folders to the project first. Save and enable to import in the background.'}
          </small>
        </div>
      )}
      {!scope.startsWith('project:') && (
        <p className="muted">
          {zh
            ? '当前为单个对话知识库。导入文件夹请先在上方选择项目；本对话上传的文档仍可自动索引。'
            : 'This is a conversation library. Select a project above to import folders; uploaded conversation documents can still be indexed automatically.'}
        </p>
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
      {value.scan && (
        <p className="muted">
          {zh ? '最近扫描：' : 'Latest scan: '}
          {value.scan.files} {zh ? '个支持文件；新增或更新 ' : 'supported files; imported/updated '}
          {value.scan.updated} · {zh ? '未变化 ' : 'unchanged '}
          {value.scan.unchanged}
        </p>
      )}
      {value.error && <p role="alert">{value.error}</p>}
      <small>
        {zh
          ? '每 30 秒检查；每范围最多 1,000 个支持文件 / 10,000 个目录项，单文件 25 MB。支持 TXT、Markdown、CSV、JSON、DOCX、XLSX、文本 PDF 等；跳过隐藏文件与构建目录；图片与扫描 PDF 使用本机 Windows OCR。临时网络故障退避重试；配置错误 3 次后暂停，移除源文件会使当前版本退出检索。'
          : 'Checks every 30 seconds; up to 1,000 supported files / 10,000 entries per scope and 25 MB per file. Text, Markdown, CSV, JSON, DOCX, XLSX and text PDFs. Hidden/build folders excluded; Windows OCR handles images/scanned PDFs. Transient network errors retry with backoff; configuration errors pause after three attempts; removed files leave current retrieval.'}
      </small>
    </section>
  );
}
