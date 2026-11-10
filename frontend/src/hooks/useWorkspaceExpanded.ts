import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const changeEvent = 'mauzcode:workspace-expanded';
// Keep controls usable when browser storage is unavailable.
const memory = new Map<string, string>();
function subscribe(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(changeEvent, notify);
  };
}

/** Persist explicit choices across reloads; synchronize desktop and mobile sidebars. */
export function useWorkspaceExpanded(projectId: string, initiallyOpen: boolean) {
  const key = `mauzcode.ui.workspace.${projectId}`;
  const [defaultOpen] = useState(initiallyOpen);
  useEffect(() => {
    try {
      if (localStorage.getItem(key) == null) localStorage.setItem(key, defaultOpen ? 'open' : 'closed');
    } catch { if (!memory.has(key)) memory.set(key, defaultOpen ? 'open' : 'closed'); }
    window.dispatchEvent(new Event(changeEvent));
  }, [key, defaultOpen]);
  const getSnapshot = useCallback(() => {
    let saved: string | null;
    try { saved = localStorage.getItem(key); } catch { saved = memory.get(key) ?? null; }
    return saved === 'open' ? true : saved === 'closed' ? false : defaultOpen;
  }, [key, defaultOpen]);
  const open = useSyncExternalStore(subscribe, getSnapshot, () => defaultOpen);
  const setOpen = useCallback((value: boolean) => {
    const saved = value ? 'open' : 'closed';
    memory.set(key, saved);
    try { localStorage.setItem(key, saved); } catch { /* Retain this session's in-memory choice. */ }
    window.dispatchEvent(new Event(changeEvent));
  }, [key]);
  return [open, setOpen] as const;
}
