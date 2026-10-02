import { FolderPlus, Trash2, X } from 'lucide-react';
import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Project } from '../../shared/types';
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
  project?: Project | null;
  onSaved: () => Promise<unknown>;
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
  project,
  onSaved,
}: ProjectDialogProps) {
  const zh = language === 'zh';
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const picker = useRef<AbortController | null>(null);
  useEffect(() => () => picker.current?.abort(), []);
  const cancelPicker = () => {
    picker.current?.abort();
    picker.current = null;
    setPicking(false);
  };
  const browse = () =>
    void action(async () => {
      const controller = new AbortController();
      picker.current = controller;
      setPicking(true);
      setPickerError('');
      try {
        const result = await api('/pick-folder', {}, 'POST', {}, controller.signal);
        const picked: string[] = result.paths || (result.path ? [result.path] : []);
        if (!controller.signal.aborted && picked.length)
          setProjectFolders((old) =>
            [
              ...new Set([
                ...old
                  .split('\n')
                  .map((p) => p.trim())
                  .filter(Boolean),
                ...picked,
              ]),
            ].join('\n'),
          );
      } catch {
        if (!controller.signal.aborted)
          setPickerError(
            zh
              ? '文件夹选择器未完成。请重试，或直接粘贴路径。'
              : 'Folder selection did not finish. Retry or paste a path.',
          );
      } finally {
        if (picker.current === controller) {
          picker.current = null;
          setPicking(false);
        }
      }
    });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const folders = projectFolders
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
  const perform = (fn: () => Promise<unknown>) =>
    void action(async () => {
      cancelPicker();
      setBusy(true);
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    });
  return (
    <div className="modal-backdrop">
      <div
        className="modal workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
      >
        <div className="section-title">
          <h2 id="project-dialog-title">
            {project ? (zh ? '管理工作区' : 'Manage workspace') : t('addProject')}
          </h2>
          <button
            disabled={busy}
            aria-label={zh ? '关闭' : 'Close'}
            onClick={() => setProjectDialog(false)}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          {zh
            ? '一个项目可以包含不同位置的文件夹，最多 12 个。创建后可随时调整；运行任务前请确认访问范围。'
            : 'A project can include up to 12 folders from different locations. Edit them later; review the access scope before running tasks.'}
        </p>
        {project?.removedAt && (
          <p role="status">
            {zh
              ? '此项目已移除。保存后恢复，历史对话与项目记忆保持原范围。'
              : 'This project is removed. Save to restore it with its original history and memory scope.'}
          </p>
        )}
        <label>
          {t('name')}
          <input
            disabled={busy}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </label>
        <button disabled={busy || picking || folders.length >= 12} onClick={browse}>
          <FolderPlus size={16} />
          {picking
            ? zh
              ? '等待系统文件夹选择…'
              : 'Waiting for folder selection…'
            : zh
              ? '用 Windows Explorer 选择文件夹…'
              : 'Browse folders in Windows Explorer…'}
        </button>
        {picking && (
          <div role="status">
            <p className="muted">
              {zh
                ? '请在系统窗口中选择文件夹；窗口可能位于浏览器后面。也可以取消选择并直接输入路径。'
                : 'Choose a folder in the system window; it may be behind your browser. You can cancel and enter a path instead.'}
            </p>
            <button onClick={cancelPicker}>
              {zh ? '取消文件夹选择' : 'Cancel folder selection'}
            </button>
          </div>
        )}
        {pickerError && <p role="alert">{pickerError}</p>}
        <p className="muted">
          {zh
            ? 'Windows Explorer 窗口支持 Ctrl / Shift 多选；不同位置的文件夹可分次添加。也可每行输入一个绝对路径。非 Windows 平台请使用路径输入。'
            : 'Use Ctrl / Shift to select multiple folders in Windows Explorer. Add folders from other locations in another selection, or enter one absolute path per line. On non-Windows platforms, enter paths manually.'}
        </p>
        <label>
          {t('folders')} · {folders.length}/12
          <textarea
            disabled={busy}
            rows={4}
            value={projectFolders}
            onChange={(e) => setProjectFolders(e.target.value)}
            placeholder={zh ? '每行一个文件夹绝对路径' : 'One absolute folder path per line'}
          />
        </label>
        <div className="workspace-folder-list">
          {folders.map((path, i) => (
            <div className="row" key={i}>
              <code style={{ overflowWrap: 'anywhere', flex: 1 }}>
                @{i} {path}
              </code>
              <button
                disabled={busy}
                aria-label={(zh ? '移除文件夹 ' : 'Remove folder ') + path}
                onClick={() => setProjectFolders(folders.filter((_, j) => j !== i).join('\n'))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        {project && !project.removedAt && (
          <details
            className="workspace-remove"
            open={confirmRemove}
            onToggle={(e) => setConfirmRemove(e.currentTarget.open)}
          >
            <summary>{zh ? '移除项目' : 'Remove Project'}</summary>
            <p>
              {zh
                ? '从工作区列表移除并停用文件访问，不删除磁盘文件、历史对话、知识库或记忆。可在侧栏归档视图找到并恢复。'
                : 'Remove from the workspace list and disable file access. Files, conversations, knowledge and memories are retained. Restore from the sidebar archive view.'}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await api('/projects/' + project.id, {}, 'DELETE');
                  setProjectDialog(false);
                  await onSaved();
                })
              }
            >
              <Trash2 size={15} />
              {zh ? '确认移除项目' : 'Confirm removal'}
            </button>
          </details>
        )}
        <div className="row end">
          <button disabled={busy} onClick={() => setProjectDialog(false)}>
            {t('cancel')}
          </button>
          <button
            className="primary"
            disabled={busy || !projectName.trim() || folders.length < 1 || folders.length > 12}
            onClick={() =>
              perform(async () => {
                const p = await api(
                  project ? '/projects/' + project.id : '/projects',
                  { name: projectName, folders },
                  project ? 'PATCH' : 'POST',
                );
                setProjectDialog(false);
                await onSaved();
                setProjectName('');
                setProjectFolders('');
                if (!project) await newChat(p.id);
              })
            }
          >
            {busy
              ? zh
                ? '处理中…'
                : 'Working…'
              : project
                ? project.removedAt
                  ? zh
                    ? '恢复项目'
                    : 'Restore project'
                  : t('save')
                : t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}
