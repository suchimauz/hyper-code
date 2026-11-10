import { filterProjects, type NavigationChat, type NavigationProject } from './navigation';
import { defaultWorkspaceView, type WorkspaceView } from '../components/mauzcode/WorkspaceViewMenu';
const key = 'mauzcode.workspace-view';
export function readWorkspaceView(): WorkspaceView {
  const requestedFilter = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('workspaceFilter');
  const filter = requestedFilter === 'active' || requestedFilter === 'archived' ? requestedFilter : undefined;
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return { group: ['workspace', 'tree', 'flat'].includes(value.group) ? value.group : defaultWorkspaceView.group, order: ['manual', 'updated'].includes(value.order) ? value.order : defaultWorkspaceView.order, filter: filter ?? (['active', 'all', 'archived'].includes(value.filter) ? value.filter : defaultWorkspaceView.filter) };
  } catch { return { ...defaultWorkspaceView, ...(filter ? { filter } : {}) }; }
}
export function saveWorkspaceView(value: WorkspaceView) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable; the current view remains usable. */ } }
/** New empty chats have no reply yet; creation still counts as activity. */
export function chatActivityAt(chat: NavigationChat): number {
  return Math.max(chat.createdAt ?? 0, chat.lastReplyAt ?? 0);
}
/** Preserve native pin priority while ordering all other chats newest first. */
export function compareChatsByActivity(a: NavigationChat, b: NavigationChat): number {
  return Number(!!b.pinned) - Number(!!a.pinned) || (a.pinned && b.pinned
    ? (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
    : chatActivityAt(b) - chatActivityAt(a));
}
export function workspaceViewProjects(projects: NavigationProject[], query: string, view: WorkspaceView) {
  const source = view.filter === 'all' ? projects.map(p => ({ ...p, archived: false, chats: p.chats.map(c => ({ ...c, archived: false })) })) : projects;
  const result = filterProjects(source, query, view.filter === 'archived');
  // Restore archive flags after filtering so per-chat actions remain truthful in the mixed view.
  if (view.filter === 'all') for (const project of result) {
    const original = projects.find(p => p.id === project.id)!;
    project.archived = original.archived;
    project.chats = project.chats.map(c => original.chats.find(o => o.id === c.id)!);
  }
  if (view.order === 'updated') {
    for (const p of result) p.chats.sort(compareChatsByActivity);
    const latest = (p: NavigationProject) => Math.max(0, ...p.chats.map(chatActivityAt));
    result.sort((a,b) => latest(b) - latest(a));
  }
  return result;
}
/** Only actual path ancestors on the same host become parents; no invented workspaces. */
export function workspaceParent(project: NavigationProject, projects: NavigationProject[]) {
  const path = project.dir.replace(/\/+$/, '');
  return projects.filter(p => p.id !== project.id && !p.virtual && p.host === project.host && p.dir && path.startsWith(p.dir.replace(/\/+$/, '') + '/')).sort((a,b) => b.dir.length - a.dir.length)[0]?.id;
}
