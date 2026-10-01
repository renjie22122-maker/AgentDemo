import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { api } from '../api';
export function VoiceInput({ conversationId, ensureConversation, onText, enabled, zh }: any) {
  const rec = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    cancelled = useRef(false);
  const [phase, setPhase] = useState('idle'),
    [error, setError] = useState(''),
    [clip, setClip] = useState<Blob | null>(null);
  const scope = useRef(conversationId);
  scope.current = conversationId;
  useEffect(
    () => () => {
      cancelled.current = true;
      if (rec.current?.state === 'recording') rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    setError('');
    try {
      if (!enabled)
        throw Error(
          zh
            ? '请先在设置中配置语音转文字服务。'
            : 'Configure a dictation service in Settings first.',
        );
      cancelled.current = false;
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(stream.current, type ? { mimeType: type } : {});
      rec.current = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (e) => {
        size += e.data.size;
        chunks.push(e.data);
        if (size > 24 * 1024 * 1024 && recorder.state === 'recording') recorder.stop();
      };
      recorder.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (!cancelled.current) {
          setClip(new Blob(chunks, { type: recorder.mimeType }));
          setPhase('ready');
        }
      };
      recorder.start(1000);
      setPhase('recording');
    } catch (e: any) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(e.message);
      setPhase('idle');
    }
  }
  async function transcribe() {
    if (!clip) return;
    setPhase('uploading');
    setError('');
    try {
      const key = conversationId || (await ensureConversation());
      const form = new FormData();
      form.append(
        'file',
        clip,
        'recording.' +
          (clip.type.includes('mp4') ? 'm4a' : clip.type.includes('ogg') ? 'ogg' : 'webm'),
      );
      const job = await api('/conversations/' + key + '/transcribe', form, undefined, {
        'X-Operation-Id': crypto.randomUUID(),
      });
      setClip(null);
      setPhase('transcribing');
      for (;;) {
        if (cancelled.current) return;
        const list = await api('/conversations/' + key + '/media');
        const j = list.find((v: any) => v.id === job.id);
        if (j?.status === 'completed') {
          if (!scope.current || scope.current === key) onText(j.text || '');
          else
            throw Error(
              zh
                ? '转写完成，结果保存在原对话的媒体任务中。'
                : 'Transcript saved in the original conversation media task.',
            );
          break;
        }
        if (['failed', 'unknown', 'cancelled'].includes(j?.status))
          throw Error(j.error || j.status);
        await new Promise((r) => setTimeout(r, 2000));
      }
      setPhase('idle');
    } catch (e: any) {
      setError(e.message);
      setPhase(clip ? 'ready' : 'idle');
    }
  }
  return (
    <div className="voice-control">
      <button
        className="icon"
        type="button"
        title={zh ? '语音输入' : 'Voice input'}
        aria-label={zh ? '语音输入' : 'Voice input'}
        disabled={['uploading', 'transcribing'].includes(phase)}
        onClick={() => (phase === 'recording' ? rec.current?.stop() : void start())}
      >
        {phase === 'recording' ? <Square size={17} /> : <Mic size={18} />}
      </button>
      {phase === 'recording' && (
        <small role="status">{zh ? '录音中 · 点击停止' : 'Recording · click to stop'}</small>
      )}
      {phase === 'ready' && (
        <>
          <button onClick={() => void transcribe()}>
            {zh ? '上传并转文字' : 'Upload & transcribe'}
          </button>
          <button
            onClick={() => {
              setClip(null);
              setPhase('idle');
            }}
          >
            {zh ? '丢弃' : 'Discard'}
          </button>
        </>
      )}
      {['uploading', 'transcribing'].includes(phase) && <small role="status">{phase}…</small>}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
