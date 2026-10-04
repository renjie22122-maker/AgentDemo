import { useEffect, useState } from 'react';
import { api } from '../api';
export function SkillPackagesPanel({ zh, refresh, notify }: any) {
  const [path, setPath] = useState(''),
    [publicKey, setPublicKey] = useState(''),
    [preview, setPreview] = useState<any>(),
    [packages, setPackages] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  const load = async () => setPackages(await api('/skill-packages'));
  useEffect(() => {
    void load().catch((e: any) => notify(e.message));
  }, []);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      await refresh();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel">
      <summary>
        {zh
          ? '扩展包 · 安装、版本与签名'
          : 'Skill packages · installation, versions and signatures'}
      </summary>
      <p className="muted">
        {zh
          ? '先从可信来源下载到本机，再预览内容摘要。安装不运行脚本，版本切换后需要在技能列表启用。'
          : 'Download from a trusted source, then review the local package. Installation runs no scripts. Enable skills after selecting a revision.'}
      </p>
      <label>
        {zh ? '本机包目录' : 'Local package directory'}
        <input
          value={path}
          disabled={busy}
          onChange={(e) => {
            setPath(e.target.value);
            setPreview(undefined);
          }}
        />
      </label>
      <label>
        {zh
          ? '可信发布者 Ed25519 公钥（PEM，可选）'
          : 'Trusted publisher Ed25519 public key (PEM, optional)'}
        <textarea
          value={publicKey}
          disabled={busy}
          onChange={(e) => {
            setPublicKey(e.target.value);
            setPreview(undefined);
          }}
        />
      </label>
      <button
        disabled={busy || !path}
        onClick={() =>
          void run(async () =>
            setPreview(
              await api('/skill-packages/preview', { path, publicKey: publicKey || undefined }),
            ),
          )
        }
      >
        {zh ? '预览并检查兼容性' : 'Preview and check compatibility'}
      </button>
      {preview && (
        <div>
          <p>
            {preview.skills.length} skills · {preview.files.length} files · {preview.signature}
          </p>
          <code style={{ overflowWrap: 'anywhere' }}>{preview.digest}</code>
          <p>
            {zh
              ? '依赖尚未执行验证；脚本和权限声明不会自动启用。'
              : 'Dependencies are not runtime-verified; scripts and permission declarations are not enabled automatically.'}
          </p>
          <ul>
            {preview.skills.map((s: any) => (
              <li key={s.path}>
                {s.name} ·{' '}
                {s.manifest?.requires?.join(', ') ||
                  (zh ? '无依赖声明' : 'No dependencies declared')}
              </li>
            ))}
          </ul>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api('/skill-packages/install', {
                  path,
                  digest: preview.digest,
                  publicKey: publicKey || undefined,
                });
                setPreview(undefined);
              })
            }
          >
            {zh ? '安装此摘要对应的版本（默认禁用）' : 'Install reviewed revision (disabled)'}
          </button>
        </div>
      )}
      {packages.map((p) => (
        <div key={p.id} className="panel">
          <strong>{p.source}</strong>
          <p>{p.removed ? (zh ? '已移除' : 'Removed') : p.digest.slice(0, 12)}</p>
          <select
            disabled={busy}
            value={p.removed ? '' : p.digest}
            onChange={(e) =>
              e.target.value &&
              void run(() => api('/skill-packages/revision', { id: p.id, digest: e.target.value }))
            }
          >
            <option value="">{zh ? '选择版本' : 'Choose revision'}</option>
            {p.revisions.map((r: any) => (
              <option key={r.digest} value={r.digest}>
                {r.digest.slice(0, 12)}
              </option>
            ))}
          </select>
          <button
            disabled={busy || p.removed}
            onClick={() => void run(() => api('/skill-packages/revision', { id: p.id }))}
          >
            {zh ? '移除并禁用（保留版本）' : 'Remove and disable (retain versions)'}
          </button>
        </div>
      ))}
    </details>
  );
}
