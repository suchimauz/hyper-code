import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { themeStorageKey, useTheme } from '../hooks/useTheme';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('persists each of the three modes across remounts', () => {
 for (const mode of ['dark', 'light', 'system'] as const) {
  const first = renderHook(useTheme);
  act(() => first.result.current.setTheme(mode));
  expect(localStorage.getItem(themeStorageKey)).toBe(mode);
  first.unmount();
  const second = renderHook(useTheme);
  expect(second.result.current.themeMode).toBe(mode); second.unmount();
 }
});
it('follows OS changes only in system mode and cleans up its listener', () => {
 let dark = false;
 const listeners = new Set<() => void>();
 vi.spyOn(window, 'matchMedia').mockImplementation(() => ({get matches(){return dark;},addEventListener: (_type: string, fn: () => void) => listeners.add(fn),removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn)}) as unknown as MediaQueryList);
 const hook = renderHook(useTheme);
 expect(hook.result.current.theme).toBe('light');
 act(() => { dark = true; listeners.forEach(fn => fn()); });
 expect(hook.result.current.theme).toBe('dark');
 act(() => hook.result.current.setTheme('light'));
 act(() => { dark = false; listeners.forEach(fn => fn()); dark = true; listeners.forEach(fn => fn()); });
 expect(hook.result.current.theme).toBe('light');
 act(() => hook.result.current.setTheme('system'));
 expect(document.documentElement.dataset.theme).toBe('dark');
 hook.unmount(); expect(listeners.size).toBe(0);
});
it('ignores invalid stored values and synchronizes changes from another tab', () => {
 localStorage.setItem(themeStorageKey, 'invalid');
 const hook = renderHook(useTheme);
 expect(hook.result.current.themeMode).toBe('system');
 act(() => { localStorage.setItem(themeStorageKey,'dark'); window.dispatchEvent(new StorageEvent('storage',{key:themeStorageKey})); });
 expect(hook.result.current.theme).toBe('dark'); hook.unmount();
});
