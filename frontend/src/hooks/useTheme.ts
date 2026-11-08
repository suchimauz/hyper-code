import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
export type ThemeMode = 'light' | 'dark' | 'system';
export const themeStorageKey = 'hyper-ui.theme';
const valid = (value: string | null): ThemeMode => value === 'light' || value === 'dark' ? value : 'system';
function readTheme(): ThemeMode {
  try { return valid(localStorage.getItem(themeStorageKey)); } catch { return 'system'; }
}
/** Browser-local preference; system mode follows OS changes without a reload. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    change(); media.addEventListener('change', change);
    const storage = (event: StorageEvent) => { if (event.key === themeStorageKey || event.key === null) setMode(readTheme()); };
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); };
  }, []);
  const theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme;
    // iOS Safari tints the status bar with theme-color; keep it equal to the chat surface.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || (theme === 'dark' ? '#212121' : '#ffffff'));
  }, [theme]);
  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next);
    try { localStorage.setItem(themeStorageKey, next); } catch { /* A blocked browser store must not prevent changing the appearance. */ }
  }, []);
  return { theme, themeMode: mode, setTheme };
}
