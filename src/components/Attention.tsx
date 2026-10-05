import { useEffect, useRef, useState } from 'react';
export function Attention({
  items,
  onSelect,
  zh = false,
}: {
  items: any[];
  onSelect: (conversation: string, input: string) => void;
  zh?: boolean;
}) {
  const seen = useRef(
      new Set<string>(
        (() => {
          try {
            return JSON.parse(sessionStorage.getItem('agentdemo.notified') || '[]');
          } catch {
            return [];
          }
        })(),
      ),
    ),
    [permission, setPermission] = useState('');
  useEffect(() => {
    for (const q of items) {
      if (seen.current.has(q.id)) continue;
      seen.current.add(q.id);
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        localStorage.getItem('agentdemo.notifications') === 'yes'
      ) {
        try {
          const n = new Notification('Amadeus', {
            body: zh ? '有任务需要你的回答或授权' : 'A task needs your answer or approval',
            tag: q.id,
          });
          n.onclick = () => {
            window.focus();
            onSelect(q.conversationId, q.id);
            n.close();
          };
        } catch {}
      }
    }
    sessionStorage.setItem('agentdemo.notified', JSON.stringify([...seen.current].slice(-500)));
  }, [items, onSelect, zh]);
  return (
    <div className="attention-bar">
      <details>
        <summary>
          {zh ? '待处理' : 'Needs attention'} · {items.length}
        </summary>
        <div className="attention-list">
          {items.map((q) => (
            <button
              key={q.id}
              onClick={(e) => {
                const menu = e.currentTarget.closest('details');
                if (menu) menu.open = false;
                onSelect(q.conversationId, q.id);
              }}
            >
              {q.kind === 'approval' ? '◇' : '↳'} {q.title || q.conversationId.slice(0, 8)} ·{' '}
              {q.kind === 'approval'
                ? zh
                  ? '操作授权'
                  : 'Approval'
                : zh
                  ? '回答问题'
                  : 'Question'}
            </button>
          ))}
          {!items.length && <span>{zh ? '暂无待处理请求' : 'No pending requests'}</span>}
          <button
            onClick={async () => {
              if (!('Notification' in window)) {
                setPermission(
                  zh
                    ? '此浏览器不支持系统通知；请使用页面提醒'
                    : 'System notifications unavailable; in-app alerts remain active',
                );
                return;
              }
              try {
                const p = await Notification.requestPermission();
                localStorage.setItem('agentdemo.notifications', p === 'granted' ? 'yes' : 'no');
                setPermission(
                  p === 'granted'
                    ? zh
                      ? '系统通知已开启'
                      : 'System notifications enabled'
                    : zh
                      ? '未授权，请在浏览器设置中开启'
                      : 'Not permitted; change browser notification settings',
                );
              } catch {
                setPermission(zh ? '通知不可用' : 'Notifications unavailable');
              }
            }}
          >
            {zh ? '启用系统通知' : 'Enable desktop notifications'}
          </button>
          <small role="status">{permission}</small>
        </div>
      </details>
    </div>
  );
}
