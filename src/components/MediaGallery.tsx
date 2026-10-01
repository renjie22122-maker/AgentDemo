import { ModelPreview } from './ModelPreview';
import { useState } from 'react';
import { api } from '../api';
export function MediaGallery({ conversationId, jobs, zh, onText }: any) {
  const [error, setError] = useState('');
  if (!jobs.length) return null;
  const active = jobs.filter((j: any) =>
    ['queued', 'running', 'submitting'].includes(j.status),
  ).length;
  const transcriptionOnly = jobs.every((j: any) => j.kind === 'transcription');
  const title = transcriptionOnly
    ? zh
      ? '\u8bed\u97f3\u8f6c\u5199'
      : 'Transcriptions'
    : zh
      ? '\u5a92\u4f53\u4ea7\u7269'
      : 'Media outputs';
  return (
    <details className="media-gallery" aria-label={title} open>
      <summary className="media-gallery-summary">
        <strong>{title}</strong>
        <span>
          {jobs.length} {zh ? '\u9879' : 'items'}
        </span>
        {active > 0 && (
          <span role="status">
            {active} {zh ? '\u9879\u8fdb\u884c\u4e2d' : 'in progress'}
          </span>
        )}
        {error && <span>{zh ? '\u66f4\u65b0\u5931\u8d25' : 'Update failed'}</span>}
      </summary>
      {error && <p role="alert">{error}</p>}
      {jobs.map((j: any) => (
        <details key={j.id} className="media-job" open>
          <summary>
            <strong>
              {j.kind} · {j.model}
            </strong>
            <span>{j.status}</span>
            <small>
              {j.estimatedUsd == null ? (zh ? '费用未知' : 'Cost unknown') : '~$' + j.estimatedUsd}
            </small>
          </summary>
          {j.prompt && <p>{j.prompt}</p>}
          {j.error && <p role="alert">{j.error}</p>}
          {j.outputs.map((f: any) => {
            const url =
              '/api/conversations/' + conversationId + '/media/' + j.id + '/files/' + f.id;
            return (
              <div className="media-output" key={f.id}>
                {f.preview ? (
                  <ModelPreview src={url} />
                ) : f.mime.startsWith('image/') ? (
                  <img loading="lazy" src={url} alt={j.prompt} />
                ) : f.mime.startsWith('video/') ? (
                  <video controls preload="metadata" src={url} />
                ) : f.mime.startsWith('audio/') ? (
                  <audio controls preload="metadata" src={url} />
                ) : null}
                <a href={url} download={f.name}>
                  {zh ? '下载' : 'Download'} {f.name}
                </a>
              </div>
            );
          })}
          {j.text !== undefined && (
            <>
              <pre>{j.text}</pre>
              <button onClick={() => onText(j.text)}>
                {zh ? '插入草稿' : 'Insert into draft'}
              </button>
            </>
          )}
          {['queued', 'running'].includes(j.status) && (
            <button
              onClick={() =>
                void api(
                  '/conversations/' + conversationId + '/media/' + j.id + '/cancel',
                  {},
                ).catch((e) => setError(e.message))
              }
            >
              {zh ? '请求取消' : 'Request cancellation'}
            </button>
          )}
        </details>
      ))}
    </details>
  );
}
