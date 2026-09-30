import { useEffect, useState } from 'react';
import type { Run } from '../../shared/types';
export function Elapsed({
  run,
  zh = false,
}: {
  run: Pick<Run, 'createdAt' | 'updatedAt' | 'status'>;
  zh?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const done = ['completed', 'failed', 'interrupted'].includes(run.status);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  const seconds = Math.max(0, Math.floor(((done ? run.updatedAt : now) - run.createdAt) / 1000));
  return (
    <small
      className="elapsed"
      title={
        zh
          ? '墙钟时间，包含模型、工具和等待用户的时间'
          : 'Wall time including model, tools and waiting for input'
      }
    >
      {zh ? '本轮耗时' : 'Turn elapsed'} · {Math.floor(seconds / 60)}:
      {String(seconds % 60).padStart(2, '0')}
      {!done ? ' · ' + run.status : ''}
    </small>
  );
}
