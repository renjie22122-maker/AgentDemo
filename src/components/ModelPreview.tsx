import { createElement, useEffect, useState } from 'react';
export function ModelPreview({ src }: { src: string }) {
  const [open, setOpen] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    import('@google/model-viewer')
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => setError('3D preview unavailable; download the model.'));
    return () => {
      cancelled = true;
    };
  }, [open]);
  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)}>3D · Preview / 预览</button>
      ) : error ? (
        <p>{error}</p>
      ) : ready ? (
        createElement('model-viewer', {
          src,
          'camera-controls': true,
          'environment-image': 'neutral',
          style: { width: '100%', height: 360 },
          alt: 'Generated 3D model',
        })
      ) : (
        <p>Loading 3D…</p>
      )}
    </div>
  );
}
