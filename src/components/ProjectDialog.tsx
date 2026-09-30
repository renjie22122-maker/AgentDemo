import { X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../api';
import { type Language } from '../i18n';
import type { Action } from '../types';

interface ProjectDialogProps {
  t: (key: string) => string;
  setProjectDialog: Dispatch<SetStateAction<boolean>>;
  projectName: string;
  setProjectName: Dispatch<SetStateAction<string>>;
  projectFolders: string;
  setProjectFolders: Dispatch<SetStateAction<string>>;
  language: Language;
  action: Action;
  newChat: (projectId?: string | null) => Promise<string>;
}
export function ProjectDialog({
  t,
  setProjectDialog,
  projectName,
  setProjectName,
  projectFolders,
  setProjectFolders,
  language,
  action,
  newChat,
}: ProjectDialogProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="section-title">
          <h2>{t('addProject')}</h2>
          <button onClick={() => setProjectDialog(false)}>
            <X size={18} />
          </button>
        </div>
        <p className="muted">{t('projectHelp')}</p>
        <label>
          {t('name')}
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </label>
        <button
          onClick={() =>
            void action(async () => {
              const result = await api('/pick-folder', {});
              if (result.path)
                setProjectFolders((old) => [old, result.path].filter(Boolean).join('\n'));
            })
          }
        >
          {language === 'zh' ? '选择文件夹…' : 'Browse folders…'}
        </button>
        <label>
          {t('folders')}
          <textarea
            rows={5}
            value={projectFolders}
            onChange={(e) => setProjectFolders(e.target.value)}
            placeholder="D:\\Projects\\my-app"
          />
        </label>
        <div className="row end">
          <button onClick={() => setProjectDialog(false)}>{t('cancel')}</button>
          <button
            className="primary"
            disabled={!projectName || !projectFolders}
            onClick={() =>
              void action(async () => {
                const p = await api('/projects', {
                  name: projectName,
                  folders: projectFolders
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                });
                setProjectDialog(false);
                setProjectName('');
                setProjectFolders('');
                await newChat(p.id);
              })
            }
          >
            {t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}
