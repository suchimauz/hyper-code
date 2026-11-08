import { ThemeMenu } from './ThemeMenu';
import type { ThemeMode } from '../../hooks/useTheme';
import { useId, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, Timer, Puzzle, Folder, FolderPlus, LogOut, PanelLeft, Plus, Search, Settings, Users, X } from 'lucide-react';
import { HoverPanel } from '../ui/HoverPanel';
import { type ProjectAction, type ChatAction, type NavigationProject, type NavigationUser } from '../../lib/navigation';
import { WorkspaceChatRow } from './WorkspaceChatRow';
import { NavigationTooltip, workspaceTooltipPath, workspaceCreatedLabel } from './NavigationTooltip';
import { useWorkspaceExpanded } from '../../hooks/useWorkspaceExpanded';
import { WorkspaceViewMenu, type WorkspaceView } from './WorkspaceViewMenu';
import { compareChatsByActivity, readWorkspaceView, saveWorkspaceView, workspaceParent, workspaceViewProjects } from '../../lib/workspaceView';
import { WorkspaceDirectoryDialog } from './WorkspaceDirectoryDialog';
import { QuotaMatrix } from './QuotaMatrix';
import type { QuotaAccount } from '../../lib/quotas';
import './workspace-sidebar.css';

export type WorkspaceSidebarProps = {
  onNewSession?: (projectId?: string) => void;
  /** Opens the in-app Settings screen from the account menu. */
  onOpenSettings?: () => void;
  /** Opens the Automation tasks page (Hyper cron tasks). */
  onOpenAutomation?: () => void; automationActive?: boolean;
  /** Opens the Plugins page (mounted Hyper plugins and catalogue). */
  onOpenPlugins?: () => void; pluginsActive?: boolean;
  pendingProjects?: Record<string, boolean>; onProjectAction?: (id: string, action: ProjectAction) => void; draftProjectId?: string;
  pendingChats?: Record<string, boolean>; actionError?: string; onAction?: (id: string, action: ChatAction) => void;
  projects: NavigationProject[]; user: NavigationUser | null; selected: string;
  compact?: boolean; mobile?: boolean; loading?: boolean; error?: string; profileError?: string;
  theme: 'light' | 'dark'; themeMode?: ThemeMode; onTheme: (mode: ThemeMode) => void; onToggle: () => void;
  onSelect: (id: string) => void; searchInputRef?: React.Ref<HTMLInputElement>; onRetry: () => void;
  /** Unified model quotas shown above the account bar; omitted or empty hides the block. */
  quotas?: QuotaAccount[] | null; onOpenQuotas?: () => void;
};

function WorkspaceSection({ project, selected, query, onSelect, archivedView, pendingChats, onAction, initiallyOpen, draftRow, onNewSession, onProjectAction, pendingProject }: { onNewSession?: (projectId?: string) => void; onProjectAction?: (id: string, action: ProjectAction) => void; pendingProject?: boolean; draftRow?: React.ReactNode; project: NavigationProject; selected: string; query: string; onSelect: (id: string) => void; archivedView: boolean; pendingChats?: Record<string, boolean>; onAction?: (id: string, action: ChatAction) => void; initiallyOpen: boolean }) {
  const [open, setOpen] = useWorkspaceExpanded(project.id, initiallyOpen);
  const id = useId();
  const expanded = !!draftRow || !!query.trim() || open;
  return <section className="workspace-section">
    <div className="workspace-heading-row"><NavigationTooltip trigger={<button className={`workspace-heading ${(project.unreadCount ?? 0) > 0 ? 'is-unread' : ''}`} aria-expanded={expanded} aria-controls={id} onClick={() => {
      if (!query.trim()) setOpen(!open);
    }}><span>{project.title}</span><ChevronDown size={12} strokeWidth={1} className="workspace-chevron" /></button>}><div className="navigation-tooltip-title">{project.title}</div>{project.dir && <div>{workspaceTooltipPath(project.dir, project.host)}</div>}{workspaceCreatedLabel(project.createdAt) && <div>{workspaceCreatedLabel(project.createdAt)}</div>}</NavigationTooltip>
    {project.runningCount ? <span className="workspace-running" aria-label={`${project.runningCount} в работе`} /> : null}
    {project.dir && <div className="workspace-project-actions">
      {!project.archived && onNewSession && <button className="nav-icon-button" aria-label={`New session in ${project.title}`} title="New session" onClick={() => onNewSession(project.id)}><Plus size={14} strokeWidth={1} /></button>}
      {onProjectAction && <button className="nav-icon-button" disabled={pendingProject} aria-label={`${project.archived ? 'Restore workspace' : 'Archive workspace'} ${project.title}`} title={project.archived ? 'Restore workspace' : 'Archive workspace'} onClick={() => onProjectAction(project.id, project.archived ? 'restore' : 'archive')}>{project.archived ? <ArchiveRestore size={14} strokeWidth={1} /> : <Archive size={14} strokeWidth={1} />}</button>}
    </div>}
    </div>
    <div id={id} hidden={!expanded}>
      {draftRow}
      {project.chats.map(chat => <WorkspaceChatRow key={chat.id} chat={chat} selected={selected === chat.id} archivedView={!!chat.archived} pending={pendingChats?.[chat.id]} onSelect={onSelect} onAction={onAction} />)}
      {!draftRow && !project.chats.length && <p className="workspace-empty">Нет чатов</p>}
    </div>
  </section>;
}

export function WorkspaceSidebar({ onOpenAutomation, automationActive, onOpenPlugins, pluginsActive, onOpenSettings, pendingProjects, onProjectAction, onNewSession, draftProjectId, pendingChats, actionError, onAction, projects, user, selected, compact = false, mobile = false, loading, error, profileError, theme, themeMode, onTheme, onToggle, onSelect, searchInputRef, onRetry, quotas, onOpenQuotas }: WorkspaceSidebarProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState(readWorkspaceView);
  const [adding, setAdding] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const changeView = (next: WorkspaceView) => { setView(next); saveWorkspaceView(next); };
  const archived = view.filter === 'archived';
  // Compute before filtering: a hidden or collapsed unread chat still marks its project.
  const filtered = workspaceViewProjects(projects.map(project => ({ ...project, unreadCount: project.chats.filter(chat => chat.hasUnread).length })), query, draftProjectId ? { ...view, filter: 'active' } : view);
  const renderProject = (project: NavigationProject): React.ReactNode => <div key={project.id} className="workspace-tree-node"><WorkspaceSection onNewSession={onNewSession} onProjectAction={user?.role === 'owner' ? onProjectAction : undefined} pendingProject={pendingProjects?.[project.id]} draftRow={draftProjectId === project.id && onNewSession ? <button className="workspace-draft-row is-selected" aria-current="page" onClick={() => onNewSession?.(project.id)}><Plus size={14} strokeWidth={1} />New Session</button> : undefined} project={project} selected={selected} query={query} onSelect={onSelect} archivedView={archived} pendingChats={pendingChats} onAction={onAction} initiallyOpen={!!projects.find(p => p.id === project.id)?.chats.some(c => c.id === selected)} />{view.group === 'tree' && <div className="workspace-tree-children">{filtered.filter(p => workspaceParent(p, filtered) === project.id).map(renderProject)}</div>}</div>;
  const flatChats = filtered.flatMap(p => p.chats.map(chat => ({ chat, archived: !!chat.archived })));
  if (view.order === 'updated') flatChats.sort((a,b) => compareChatsByActivity(a.chat, b.chat));
  const initials = user?.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <nav className={`workspace-sidebar ${compact ? 'is-compact' : ''}`} aria-label="Навигация по агентам">
    <div className="workspace-brand-row">
      {compact ? <button className="nav-icon-button compact-brand" aria-label="Развернуть навбар" onClick={onToggle}><span className="brand-mark">h</span><PanelLeft size={16} strokeWidth={1} /></button> : <><span className="workspace-brand"><span className="brand-mark">h</span>Hyper</span><button className="nav-icon-button" aria-label={mobile ? 'Закрыть навигацию' : 'Свернуть навбар'} onClick={onToggle}>{mobile ? <X size={16} strokeWidth={1} /> : <PanelLeft size={16} strokeWidth={1} />}</button></>}
    </div>
    {!compact && <div className="workspace-filter"><Search size={14} strokeWidth={1} aria-hidden="true" /><input ref={searchInputRef} aria-keyshortcuts="Meta+/ Control+/" title="Найти агента или проект · ⌘/" aria-label="Найти агента или проект" placeholder="Найти агента или проект…" value={query} onChange={event => setQuery(event.target.value)} /><kbd className="workspace-filter-shortcut" aria-hidden="true">⌘/</kbd>{query && <button aria-label="Очистить фильтр" onClick={() => setQuery('')}><X size={12} /></button>}</div>}
    <div className="workspace-actions">
      <button className="workspace-action" aria-label="New Session" title="New Session" onClick={() => onNewSession?.()} disabled={!onNewSession}><span className="new-session-icon"><Plus size={12} strokeWidth={1.5} /></span>{!compact && <span>New Session</span>}</button>
      {onOpenPlugins && <button className={`workspace-action ${pluginsActive ? 'is-selected' : ''}`} aria-current={pluginsActive ? 'page' : undefined} aria-label="Plugins" title="Plugins" onClick={onOpenPlugins}><Puzzle size={16} strokeWidth={1} />{!compact && <span>Plugins</span>}</button>}
      {onOpenAutomation && <button className={`workspace-action ${automationActive ? 'is-selected' : ''}`} aria-current={automationActive ? 'page' : undefined} aria-label="Cron Tasks" title="Cron Tasks" onClick={onOpenAutomation}><Timer size={16} strokeWidth={1} />{!compact && <span>Cron Tasks</span>}</button>}
      {compact && <button className="workspace-action" aria-label="Workspaces" title="Workspaces" onClick={onToggle}><Folder size={16} strokeWidth={1} /></button>}
    </div>
    {!compact && <><div className={`workspace-list-heading ${view.filter !== 'active' ? 'is-filtered' : ''}`}><span className="workspace-list-label">Workspaces</span><div className="workspace-view-switch" aria-label="Вид чатов"><button aria-pressed={view.filter === 'active'} onClick={() => changeView({ ...view, filter: 'active' })}>Active</button><button aria-pressed={archived} onClick={() => changeView({ ...view, filter: 'archived' })}>Archived</button></div><div className="workspace-heading-actions"><WorkspaceViewMenu view={view} onChange={changeView} /><button className="nav-icon-button" aria-label="Добавить новый Workspace" title="Add workspace" onClick={() => setAdding(true)}><FolderPlus size={16} strokeWidth={1} /></button></div></div>
      <div className="workspace-list">
        {loading && <p className="workspace-empty" role="status">Загрузка…</p>}
        {error && <div className="workspace-error" role="alert">{error}<button onClick={onRetry}>Повторить</button></div>}
        {actionError && <p className="workspace-error" role="alert">{actionError}</p>}
        {view.group === 'flat' && draftProjectId && <button className="workspace-draft-row is-selected" aria-current="page" onClick={() => onNewSession?.(draftProjectId)}><Plus size={14} strokeWidth={1} />New Session</button>}
        {view.group === 'flat' ? flatChats.map(({ chat, archived: chatArchived }) => <WorkspaceChatRow key={chat.id} chat={chat} selected={selected === chat.id} archivedView={chatArchived} pending={pendingChats?.[chat.id]} onSelect={onSelect} onAction={onAction} />) : filtered.filter(p => view.group !== 'tree' || !workspaceParent(p, filtered)).map(renderProject)}
        {!loading && !error && !filtered.length && <p className="workspace-empty">{query ? 'Ничего не найдено' : 'Нет рабочих пространств'}</p>}
      </div></>}
    <WorkspaceDirectoryDialog open={adding} onOpenChange={setAdding} onCreated={onRetry} />
    {quotas && quotas.length > 0 && <QuotaMatrix accounts={quotas} compact={compact} onOpen={onOpenQuotas ?? onOpenSettings} />}
    <div className="workspace-account">
      {user ? <HoverPanel label="Меню профиля" className="workspace-account-menu" open={accountOpen} onOpenChange={setAccountOpen} trigger={<button className="workspace-profile" aria-label={`Профиль: ${user.name}`} title={compact ? user.name : undefined}>
        <span className="workspace-avatar">{user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : initials}</span>
        {!compact && <><span className="workspace-identity"><strong>{user.name}</strong><span>{user.role === 'owner' ? 'Owner' : 'Member'}</span></span><ChevronDown size={14} strokeWidth={1} /></>}
      </button>}><div className="workspace-account-menu-name">{user.name}</div>{user.role === 'owner' && <a href="/auth/users"><Users size={14} strokeWidth={1} />People</a>}{onOpenSettings && <button type="button" className="workspace-account-menu-item" onClick={() => { setAccountOpen(false); onOpenSettings(); }}><Settings size={14} strokeWidth={1} />Settings</button>}<form method="post" action="/auth/logout"><button type="submit"><LogOut size={14} strokeWidth={1} />Sign out</button></form></HoverPanel> : !compact && <span className="workspace-profile-missing" title={profileError}>{profileError ? 'Профиль недоступен' : 'Hyper'}</span>}
      <ThemeMenu mode={themeMode ?? theme} onChange={onTheme} />
    </div>
  </nav>;
}
