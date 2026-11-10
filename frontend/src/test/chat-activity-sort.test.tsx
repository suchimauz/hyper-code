import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';
import { defaultWorkspaceView } from '../components/mauzcode/WorkspaceViewMenu';
import { chatActivityAt, compareChatsByActivity, workspaceViewProjects } from '../lib/workspaceView';
import type { NavigationChat, NavigationProject } from '../lib/navigation';

const chat = (id: string, createdAt: number | null, lastReplyAt: number | null): NavigationChat => ({ id, title: id, createdAt, lastReplyAt, model: '', runState: 'idle', hasUnread: false });
const projects: NavigationProject[] = [
  { id: 'old', title: 'Old workspace', host: null, dir: '/old', chats: [chat('reply', 10, 30), chat('undated', null, null)] },
  { id: 'new', title: 'New workspace', host: null, dir: '/new', chats: [chat('older-empty', 20, null), chat('new-empty', 40, null)] },
];
afterEach(() => { cleanup(); localStorage.clear(); });
it('ranks empty chats by creation together with replies, and ranks their workspaces accordingly', () => {
  const result = workspaceViewProjects(projects, '', defaultWorkspaceView);
  expect(result.map(p => p.id)).toEqual(['new', 'old']);
  expect(result[0].chats.map(c => c.id)).toEqual(['new-empty', 'older-empty']);
  expect(projects.flatMap(p => p.chats).sort(compareChatsByActivity).map(c => c.id)).toEqual(['new-empty', 'reply', 'older-empty', 'undated']);
  expect(projects[1].chats.map(c => c.id)).toEqual(['older-empty', 'new-empty']);
  expect(chatActivityAt(chat('fork', 50, 30))).toBe(50);
  expect(chatActivityAt({ ...chat('legacy', null, null), createdAt: undefined })).toBe(0);
});
it('preserves pin order and manual order', () => {
  const pinned = { ...chat('pin', 1, 2), pinned: true, pinnedAt: 10 };
  const newerPin = { ...chat('new-pin', 1, 2), pinned: true, pinnedAt: 20 };
  expect([projects[1].chats[1], pinned, newerPin].sort(compareChatsByActivity).map(c => c.id)).toEqual(['new-pin', 'pin', 'new-empty']);
  const manual = workspaceViewProjects(projects, '', { ...defaultWorkspaceView, order: 'manual' });
  expect(manual.map(p => p.id)).toEqual(['old', 'new']);
  expect(manual[1].chats.map(c => c.id)).toEqual(['older-empty', 'new-empty']);
});
it('renders newest empty chat first across workspaces in the flat list, without inventing a reply date', () => {
  localStorage.setItem('mauzcode.workspace-view', JSON.stringify({ ...defaultWorkspaceView, group: 'flat' }));
  render(<WorkspaceSidebar projects={projects} user={null} selected="new-empty" theme="light" onTheme={vi.fn()} onToggle={vi.fn()} onSelect={vi.fn()} onRetry={vi.fn()} />);
  const rows = screen.getAllByRole('button').filter(button => ['new-empty', 'reply', 'older-empty', 'undated'].some(id => button.textContent?.includes(id)) && button.classList.contains('workspace-chat'));
  expect(rows.map(row => row.textContent?.match(/new-empty|older-empty|undated|reply/)?.[0])).toEqual(['new-empty', 'reply', 'older-empty', 'undated']);
  expect(rows[0].querySelector('time')).not.toHaveAttribute('datetime');
  expect(rows[0].querySelector('time')).toHaveTextContent('—');
});
