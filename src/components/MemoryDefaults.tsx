import { useEffect, useState } from 'react';
import { api } from '../api';
export function MemoryDefaults({ scope, state, zh, notify }: any) {
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  const profile = state.settings.profiles.find(
    (p: any) => p.id === state.settings.defaultProfileId,
  );
  useEffect(() => {
    let live = true;
    api('/memory-policy?scope=' + encodeURIComponent(scope))
      .then((x: any) => {
        if (live) setEnabled(x.enabled);
      })
      .catch((e: any) => notify(e.message));
    return () => {
      live = false;
    };
  }, [scope]);
  return (
    <section className="panel">
      <h3>{zh ? '本范围的新对话默认设置' : 'New-chat defaults for this scope'}</h3>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !profile}
          onChange={async (e) => {
            const previous = enabled,
              next = e.target.checked;
            setEnabled(next);
            setBusy(true);
            try {
              await api('/memory-policy', { scope, enabled: next, profileId: profile.id });
              setEnabled(next);
            } catch (e: any) {
              setEnabled(previous);
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {zh
          ? '新对话自动管理记忆，现有继承设置的对话同步更新'
          : 'Automatic memory for new chats and existing inheriting chats'}
      </label>
      <p className="muted">
        {zh
          ? '仅授权此模型地址处理本范围记忆；对话级例外不覆盖：'
          : 'Only this model destination is authorized; per-chat overrides remain: '}
        {profile?.baseUrl || '—'}
      </p>
    </section>
  );
}
