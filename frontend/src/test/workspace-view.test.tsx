import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceViewMenu, defaultWorkspaceView } from '../components/hyper/WorkspaceViewMenu';
import { readWorkspaceView, saveWorkspaceView, workspaceParent, workspaceViewProjects } from '../lib/workspaceView';
import type { NavigationProject } from '../lib/navigation';
const chat = (id: string, time: number, archived = false) => ({ id, title: id, model: '', runState: 'idle', hasUnread: false, lastReplyAt: time, archived });
const projects: NavigationProject[] = [
  { id: 'root', title: 'Root', host: null, dir: '/works', chats: [chat('a', 1), chat('old', 9, true)] },
  { id: 'child', title: 'Child', host: null, dir: '/works/ui', chats: [chat('b', 3)] },
  { id: 'remote', title: 'Remote', host: 'server', dir: '/works/ui', chats: [] },
];
afterEach(() => localStorage.clear());
it('persists validated view preferences and handles malformed storage', () => {
  saveWorkspaceView({ group: 'flat', order: 'manual', filter: 'all' });
  expect(readWorkspaceView()).toEqual({ group: 'flat', order: 'manual', filter: 'all' });
  localStorage.setItem('hyper.workspace-view', 'not json');
  expect(readWorkspaceView()).toEqual(defaultWorkspaceView);
});
it('sorts by real reply time and preserves archived flags in mixed mode without mutating data', () => {
  expect(workspaceViewProjects(projects, '', defaultWorkspaceView).map(p => p.id)).toEqual(['child', 'root', 'remote']);
  const all = workspaceViewProjects(projects, '', { ...defaultWorkspaceView, filter: 'all' });
  expect(all[0].chats[0]).toMatchObject({ id: 'old', archived: true });
  expect(projects[0].chats[0].id).toBe('a');
  expect(workspaceViewProjects(projects, '', { ...defaultWorkspaceView, order: 'manual' })[0].id).toBe('root');
});
it('nests only actual workspace path ancestors on the same host', () => {
  expect(workspaceParent(projects[1], projects)).toBe('root');
  expect(workspaceParent(projects[2], projects)).toBeUndefined();
});
it('opens the settings menu and selects a real grouping mode', async () => {
  const user = userEvent.setup(); const onChange = vi.fn();
  render(<WorkspaceViewMenu view={defaultWorkspaceView} onChange={onChange} />);
  screen.getByRole('button', { name: 'Настройки рабочих пространств' }).focus();
  await user.keyboard('{ArrowDown}');
  expect(await screen.findByRole('menuitemradio', { name: 'WorkSpace' })).toHaveAttribute('aria-checked', 'true');
  await user.click(screen.getByRole('menuitemradio', { name: 'In one list' }));
  expect(onChange).toHaveBeenCalledWith({ ...defaultWorkspaceView, group: 'flat' });
});
