import { requestJson } from './mauzcode';

export type NavigationIcon = { src: string; custom: boolean };
export type NavigationChat = { colorHue?: number | null; pinned?: boolean; pinnedAt?: number | null; icon?: NavigationIcon | null; id: string; title: string; model: string; modelLabel?: string; effort?: { requested: string; applied: string; label: string | null; downgraded: boolean } | null; createdAt?: number | null; runState: string; teamRunningCount?: number; hasUnread: boolean; archived?: boolean; lastReplyAt: number | null };
export type NavigationProject = { createdAt?: number | null; id: string; title: string; dir: string; host: string | null; virtual?: boolean; archived?: boolean; runningCount?: number; unreadCount?: number; chats: NavigationChat[] };
export type NavigationData = { projects: NavigationProject[] };
export type NavigationUser = { id?: number | string; name: string; email?: string; picture?: string | null; role: 'owner' | 'member' };
/** Server-computed native owner capability; never infer it from missing user/profile data. */
export type AuthSession = { authenticated: boolean; canManage: boolean; user: NavigationUser | null };
export const getNavigation = (signal?: AbortSignal) => requestJson<NavigationData>('/ui-lab-api/navigation', { signal });
export type ProjectAction = 'archive' | 'restore';
/** Native personal project archive; never rewrites chat flags. */
export async function updateProject(projectId: string, action: ProjectAction) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('/ui-lab-api/project-action');
  const result = await requestJson<{ ok: boolean; archived: boolean }>('/ui-lab-api/project-action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ projectId, action }) });
  if (!result.ok) throw new Error('MauzCode не подтвердил действие. Обновите список.');
  return result;
}
export type ChatAction = 'pin' | 'unpin' | 'archive' | 'restore';
/** Use the native personal pin and global archive endpoints. */
export async function updateChat(id: string, action: ChatAction) {
  const agent = encodeURIComponent(id);
  const path = action === 'restore' ? `/agent/${agent}/unarchive` : `/api/v1/agents/${agent}/${action === 'pin' || action === 'unpin' ? 'pin' : 'archive'}`;
  const result = await requestJson<{ ok?: boolean; pinned?: boolean; archived?: boolean }>(path, { method:'POST', ...(action === 'pin' || action === 'unpin' ? { headers:{'Content-Type':'application/json'},body:JSON.stringify({pinned:action === 'pin'}) } : {}) });
  if (result.ok === false) throw new Error('MauzCode не подтвердил действие. Обновите список.');
  return result;
}

export const getProfile = (signal?: AbortSignal) => requestJson<AuthSession>('/auth/session', { signal });

/** Display the actual last assistant reply, never the session's modification time. */
export function replyAge(timestamp: number | null, now = Date.now()): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return '—';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', ...(new Date(timestamp).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' as const } : {}) }).format(timestamp);
}

/** Workspace identity comes from the server (including host), not basename grouping. */
export function filterProjects(projects: NavigationProject[], query: string, archived: boolean) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every(word => text.toLocaleLowerCase().includes(word));
  return projects.flatMap(project => {
    const chats = project.chats.filter(chat => (archived ? !!project.archived || !!chat.archived : !project.archived && !chat.archived));
    const projectMatches = matches(`${project.title} ${project.dir} ${project.host || ''}`);
    const visible = projectMatches ? chats : chats.filter(chat => matches(`${chat.id} ${chat.title} ${project.title} ${project.dir}`));
    if ((!projectMatches && !visible.length) || (archived && !project.archived && !visible.length) || (!archived && project.archived)) return [];
    return [{ ...project, chats: [...visible].sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.pinned && b.pinned ? (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) : 0)) }];
  });
}
