import { useCallback, useEffect, useRef, useState } from 'react';
import { liveRefresh } from '../lib/liveRefresh';
import { getNavigation, getProfile, updateChat, updateProject, type ProjectAction, type ChatAction, type NavigationData, type NavigationUser } from '../lib/navigation';

/** Sidebar data and acknowledged native chat actions; independent of selected chat. */
export function useNavigation() {
  const [data, setData] = useState<NavigationData>({ projects: [] });
  const [user, setUser] = useState<NavigationUser | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingChats, setPendingChats] = useState<Record<string,boolean>>({});
  const [pendingProjects, setPendingProjects] = useState<Record<string,boolean>>({});
  const [actionError, setActionError] = useState('');
  const locks = useRef(new Set<string>());
  const mutation = useRef(0);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    const live = liveRefresh({ name: 'react-navigation', fallbackMs: 5000,
      matches: event => !event.topic || event.topic === 'agents' || event.type === 'agents.changed',
      read: async signal => {
        const version = mutation.current;
        try {
          const result = await getNavigation(signal);
          if (!signal.aborted && version === mutation.current) { setData(result); setError(''); }
        } catch (err) { if (!signal.aborted) setError(err instanceof Error ? err.message : String(err)); }
        finally { if (!signal.aborted) setLoading(false); }
      },
    });
    refreshRef.current = live.refresh;
    const read = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      mutation.current++;
      setData(old => ({ projects: old.projects.map(project => {
        const wasUnread = project.chats.some(chat => chat.id === id && chat.hasUnread);
        return { ...project, unreadCount: Math.max(0, (project.unreadCount ?? 0) - Number(wasUnread)),
          chats: project.chats.map(chat => chat.id === id ? { ...chat, hasUnread: false } : chat) };
      }) }));
      live.refresh();
    };
    window.addEventListener('mauzcode-ui:read', read);
    return () => { live.dispose(); window.removeEventListener('mauzcode-ui:read', read); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void getProfile(controller.signal).then(session => { if (!controller.signal.aborted) { setUser(session.user); setCanManage(session.canManage === true); setProfileError(''); } }).catch(err => { if (!controller.signal.aborted) setProfileError(err instanceof Error ? err.message : String(err)); });
    return () => controller.abort();
  }, []);
  const act = async (id: string, action: ChatAction) => {
    if (locks.current.has(id)) return false;
    locks.current.add(id); mutation.current++; setPendingChats(old => ({...old,[id]:true})); setActionError('');
    try {
      const result = await updateChat(id, action);
      mutation.current++;
      setData(old => ({projects:old.projects.map(project => ({...project,chats:project.chats.map(chat => chat.id !== id ? chat : action === 'archive' || action === 'restore' ? {...chat,archived:action === 'archive'} : {...chat,pinned:result.pinned ?? action === 'pin',pinnedAt:action === 'pin' ? Date.now() : null})}))}));
      refresh(); return true;
    } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); return false; }
    finally { locks.current.delete(id); setPendingChats(old => ({...old,[id]:false})); }
  };
  const actProject = async (id: string, action: ProjectAction) => {
    const lock = 'project:' + id;
    if (locks.current.has(lock)) return false;
    locks.current.add(lock); mutation.current++; setPendingProjects(old => ({...old,[id]:true})); setActionError('');
    try {
      const result = await updateProject(id, action);
      mutation.current++;
      setData(old => ({projects:old.projects.map(project => project.id === id ? {...project,archived:result.archived} : project)}));
      refresh(); return true;
    } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); return false; }
    finally { locks.current.delete(lock); setPendingProjects(old => ({...old,[id]:false})); }
  };
  return { actProject, pendingProjects, ...data, user, canManage, error, profileError, loading, refresh, act, pendingChats, actionError };
}
