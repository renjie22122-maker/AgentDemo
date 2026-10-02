import { useState } from 'react';
import { api } from '../api';
export function SkillClassificationPanel({ state, refresh, notify, zh }: any) {
  const [profile, setProfile] = useState(state.settings.defaultProfileId),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<any>(null);
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <h3>{zh ? 'AI 自动分类' : 'AI classification'}</h3>
      <p>
        {zh
          ? '仅发送技能名称与描述，不发送正文、脚本或聊天。先预览再应用，会产生模型费用。来源保持不变。'
          : 'Sends names and descriptions only, not scripts or chats. Preview before applying; model charges apply. Sources remain unchanged.'}
      </p>
      <select
        disabled={busy}
        value={profile}
        onChange={(e) => {
          setProfile(e.target.value);
          setConsent(false);
        }}
      >
        {state.settings.profiles.map((p: any) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.model}
          </option>
        ))}
      </select>
      <small>{state.settings.profiles.find((p: any) => p.id === profile)?.baseUrl}</small>
      <label className="checkbox">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {zh
          ? '允许向此服务发送当前技能名称和描述进行分类'
          : 'Allow sending current skill names and descriptions to this service for classification'}
      </label>
      <button
        disabled={busy || !consent || !state.skills.length}
        onClick={() =>
          void go(async () =>
            setDraft(await api('/skills/classify', { profileId: profile, consent: true })),
          )
        }
      >
        {busy ? (zh ? '处理中…' : 'Working…') : zh ? '生成分类预览' : 'Generate preview'}
      </button>
      {draft && (
        <div>
          <p>
            {draft.model} · {draft.assignments.length} skills
          </p>
          <div className="row wrap">
            {draft.categories.map((c: any) => (
              <span className="risk-badge" key={c.id}>
                {zh ? c.labelZh : c.labelEn} ·{' '}
                {draft.assignments.filter((a: any) => a.categories.includes(c.id)).length}
              </span>
            ))}
          </div>
          <details>
            <summary>{zh ? '查看每个技能的分类' : 'Review assignments'}</summary>
            {draft.assignments.map((a: any) => (
              <p key={a.id}>
                {state.skills.find((s: any) => s.id === a.id)?.name} ·{' '}
                {a.categories
                  .map((id: string) => {
                    const c = draft.categories.find((c: any) => c.id === id);
                    return zh ? c.labelZh : c.labelEn;
                  })
                  .join(' / ')}
              </p>
            ))}
          </details>
          <button
            disabled={busy}
            onClick={() =>
              void go(async () => {
                await api('/skills/classify/apply', { id: draft.id });
                setDraft(null);
                await refresh();
              })
            }
          >
            {zh ? '应用分类' : 'Apply categories'}
          </button>
          <button disabled={busy} onClick={() => setDraft(null)}>
            {zh ? '放弃' : 'Discard'}
          </button>
        </div>
      )}
    </section>
  );
}
