import { SecurityControl } from './SecurityControl';
import { VoiceInput } from './VoiceInput';
import { TeamAutomationControls } from './TeamAutomationControls';
import { DelegationControl } from './DelegationControl';
import { ReasoningSlider } from './ReasoningSlider';
import { ArrowDown, ArrowUp, Paperclip, Plus, Square, X } from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Conversation, Project, PublicProfile } from '../../shared/types';
import { api } from '../api';
import type { Action, ConversationDetail, RunView, UiState } from '../types';

interface ComposerProps {
  ensureConversation: () => Promise<string>;
  run: RunView | undefined;
  running: boolean | undefined;
  detail: ConversationDetail | null;
  send: (text?: string) => Promise<void>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  drag: boolean;
  setDrag: Dispatch<SetStateAction<boolean>>;
  action: Action;
  removeAttachment: (id: string) => Promise<void>;
  addFiles: (files: FileList | File[]) => Promise<void>;
  draftRef: RefObject<HTMLTextAreaElement | null>;
  upload: RefObject<HTMLInputElement | null>;
  profile: PublicProfile | undefined;
  state: UiState;
  conversation: Conversation | undefined;
  update: (data: Record<string, unknown>) => Promise<void>;
  project: Project | undefined;
  t: (key: string) => string;
  stick: RefObject<boolean>;
  bottom: RefObject<HTMLDivElement | null>;
  sending: boolean;
}
export function Composer({
  ensureConversation,
  run,
  running,
  detail,
  send,
  draft,
  setDraft,
  drag,
  setDrag,
  action,
  addFiles,
  removeAttachment,
  draftRef,
  upload,
  profile,
  state,
  conversation,
  update,
  project,
  t,
  stick,
  bottom,
  sending,
}: ComposerProps) {
  return (
    <div className="composer-area">
      <div className="composer-width">
        {run && ['interrupted', 'failed'].includes(run.status) && (
          <button
            className="resume-button"
            disabled={sending}
            onClick={() =>
              void send(
                'Continue the unfinished task. Inspect existing results first. Do not replay completed or unknown side effects.',
              )
            }
          >
            ↻{' '}
            {detail?.unknownEffects.length
              ? t('settings') !== 'Settings'
                ? '只读检查并继续讨论'
                : 'Inspect safely and discuss'
              : t('resume')}
          </button>
        )}
        <div
          className={'composer ' + (drag ? 'dragging' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void action(() => addFiles(e.dataTransfer.files));
          }}
        >
          {detail && detail.attachments.some((a) => !a.messageEventId) && (
            <div className="attachment-chips">
              {detail.attachments
                .filter((a) => !a.messageEventId)
                .map((a: any) => (
                  <span className="draft-attachment" key={a.id}>
                    <a href={'/api/attachments/' + a.id} target="_blank" rel="noopener noreferrer">
                      {['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(a.mime) ? (
                        <img src={'/api/attachments/' + a.id + '?preview=1'} alt={a.name} />
                      ) : (
                        <Paperclip size={12} />
                      )}
                      {a.name}
                    </a>
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={
                        (t('settings') === 'Settings' ? 'Remove attachment: ' : '删除附件：') +
                        a.name
                      }
                      onClick={() => void action(() => removeAttachment(a.id))}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
            </div>
          )}
          <textarea
            ref={draftRef}
            aria-label="Message"
            value={draft}
            placeholder={running ? t('draft') : t('ask')}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.files);
              if (images.length) {
                e.preventDefault();
                void action(() => addFiles(images));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-controls">
            <div className="row minzero">
              <button
                className="icon"
                title={t('attachments')}
                onClick={() => upload.current?.click()}
              >
                <Plus size={20} />
              </button>
              <input
                hidden
                multiple
                ref={upload}
                type="file"
                onChange={(e) => {
                  if (e.target.files) void action(() => addFiles(e.target.files!));
                  e.target.value = '';
                }}
              />
              <VoiceInput
                key={conversation?.id || 'new'}
                conversationId={conversation?.id}
                ensureConversation={ensureConversation}
                enabled={!!state.settings.media?.transcriptionId}
                zh={t('settings') !== 'Settings'}
                onText={(text: string) => setDraft((d) => d + (d ? '\n' : '') + text)}
              />
              <span className="composer-model">
                {profile?.model ||
                  state.settings.profiles.find((p: any) => p.id === state.settings.defaultProfileId)
                    ?.model ||
                  t('noModel')}
              </span>
              {conversation && (
                <>
                  <ReasoningSlider
                    label={t('reasoning')}
                    zh={t('settings') !== 'Settings'}
                    disabled={!!running}
                    value={conversation.reasoning}
                    efforts={profile?.efforts || ['auto']}
                    onChange={(reasoning) => void action(() => update({ reasoning }))}
                  />
                  <DelegationControl
                    mode={conversation.teamMode || 'hierarchy'}
                    onModeChange={(teamMode) => void action(() => update({ teamMode }))}
                    management={
                      detail?.teamSpace ? (
                        <TeamAutomationControls
                          id={detail.teamSpace.id}
                          policy={detail.teamAutomation}
                          recovery={detail.teamRecovery || []}
                          events={detail.teamControlEvents || []}
                          zh={t('settings') !== 'Settings'}
                          action={action}
                        />
                      ) : undefined
                    }
                    value={conversation.teamStrategy || 'auto'}
                    disabled={!!running}
                    zh={t('settings') !== 'Settings'}
                    onChange={(teamStrategy) => void action(() => update({ teamStrategy }))}
                    depth={state.settings.maxAgentDepth}
                    total={state.settings.maxChildren}
                    parallel={state.settings.maxParallelRuns}
                  />
                  <SecurityControl
                    conversation={conversation}
                    settings={state.settings as any}
                    disabled={!!running}
                    zh={t('settings') !== 'Settings'}
                    onChange={(patch) => void action(() => update(patch))}
                  />
                </>
              )}
            </div>
            <div className="row">
              {running &&
                run &&
                conversation?.teamMode &&
                conversation.teamMode !== 'hierarchy' && (
                  <button
                    onClick={() => void action(() => api('/runs/' + run.id + '/stop-member', {}))}
                  >
                    {t('settings') !== 'Settings' ? '仅停止当前成员' : 'Stop this member only'}
                  </button>
                )}
              {running && run && (
                <button
                  className="stop-button"
                  title={t('stop')}
                  onClick={() => void action(() => api('/runs/' + run.id + '/stop', {}))}
                >
                  <Square size={13} />
                </button>
              )}
              <button
                className="send-button"
                aria-label={t('send')}
                disabled={
                  sending ||
                  (!draft.trim() && !detail?.attachments.some((a) => !a.messageEventId)) ||
                  !state.settings.profiles.length
                }
                onClick={() => void send()}
              >
                <ArrowUp size={19} />
              </button>
            </div>
          </div>
        </div>
        <div className="composer-foot">
          <span>
            {running
              ? t('draft')
              : project
                ? project.folders.length +
                  ' folder(s) · ' +
                  t(
                    conversation?.permission === 'auto'
                      ? t('settings') !== 'Settings'
                        ? '帮我审批'
                        : 'Approve for me'
                      : conversation?.permission === 'trusted'
                        ? 'trusted'
                        : conversation?.permission === 'read-only'
                          ? 'readOnly'
                          : 'askMode',
                  )
                : t('artifacts')}
          </span>
          <button
            title="Latest message"
            onClick={() => {
              stick.current = true;
              bottom.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <ArrowDown size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
