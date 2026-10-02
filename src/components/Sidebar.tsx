import {
  Archive,
  BookOpen,
  Brain,
  Folder,
  FolderPlus,
  Library as LibraryIcon,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Conversation, Project } from '../../shared/types';
import { type Language } from '../i18n';
import type { Action, UiState } from '../types';

interface SidebarProps {
  editProject: (project: Project) => void;
  t: (key: string) => string;
  state: UiState;
  setSidebar: Dispatch<SetStateAction<boolean>>;
  action: Action;
  newChat: (projectId?: string | null) => Promise<string>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setProjectDialog: Dispatch<SetStateAction<boolean>>;
  archived: boolean;
  setArchived: Dispatch<SetStateAction<boolean>>;
  filtered: Conversation[];
  chatLink: (c: Conversation) => ReactNode;
  page: string;
  setPage: Dispatch<SetStateAction<string>>;
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  theme: string;
  setTheme: Dispatch<SetStateAction<string>>;
}
export function Sidebar({
  editProject,
  t,
  state,
  setSidebar,
  action,
  newChat,
  query,
  setQuery,
  setProjectDialog,
  archived,
  setArchived,
  filtered,
  chatLink,
  page,
  setPage,
  language,
  setLanguage,
  theme,
  setTheme,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Sparkles size={20} />
        </div>
        <strong>
          {t('AgentDemo')}
          <span>{t('YOUR LOCAL WORKSPACE')}</span>
        </strong>
        <button className="icon" title="Hide sidebar" onClick={() => setSidebar(false)}>
          <PanelLeftClose size={18} />
        </button>
      </div>
      <button className="new-chat" onClick={() => void action(() => newChat())}>
        <Plus size={18} />
        {t('newChat')}
        <kbd>＋</kbd>
      </button>
      <div className="search">
        <Search size={15} />
        <input
          aria-label={t('search')}
          placeholder={t('search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav className="chat-navigation">
        <div className="nav-heading">
          <span>{t('projects')}</span>
          <button title={t('addProject')} onClick={() => setProjectDialog(true)}>
            <Plus size={15} />
          </button>
        </div>
        {state.projects
          .filter((p: Project) => !p.removedAt || archived)
          .map((p: Project) => (
            <details className="project-group" key={p.id} open>
              <summary>
                <Folder size={15} />
                <span>
                  {p.name}
                  {p.removedAt ? (language === 'zh' ? ' · 已移除' : ' · Removed') : ''}
                </span>
                <button
                  title={language === 'zh' ? '管理工作区' : 'Manage workspace'}
                  onClick={(e) => {
                    e.preventDefault();
                    editProject(p);
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                <button
                  title={t('newChat')}
                  disabled={!!p.removedAt}
                  onClick={(e) => {
                    e.preventDefault();
                    void action(() => newChat(p.id));
                  }}
                >
                  <Plus size={14} />
                </button>
              </summary>
              {filtered.filter((c: any) => c.projectId === p.id).map(chatLink)}
            </details>
          ))}
        {!state.projects.length && (
          <button className="add-project" onClick={() => setProjectDialog(true)}>
            <FolderPlus size={15} />
            {t('addProject')}
          </button>
        )}
        <div className="nav-heading">
          <span>{archived ? t('archiveView') : t('chats')}</span>
          <button title={t('archiveView')} onClick={() => setArchived(!archived)}>
            <Archive size={14} />
          </button>
        </div>
        {filtered.filter((c: any) => !c.projectId).map(chatLink)}
      </nav>
      <div className="sidebar-tools">
        {[
          ['knowledge', LibraryIcon],
          ['skills', BookOpen],
          ['memory', Brain],
          ['settings', Settings],
        ].map(([key, Icon]: any) => (
          <button className={page === key ? 'selected' : ''} key={key} onClick={() => setPage(key)}>
            <Icon size={17} />
            {t(key)}
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <span className="local-status">
          <i />
          {t('Local')}
        </span>
        <button title={t('language')} onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}>
          {language === 'en' ? '中文' : 'EN'}
        </button>
        <button title={t('theme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}
