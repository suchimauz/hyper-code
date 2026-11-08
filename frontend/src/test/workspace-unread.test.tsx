import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceSidebar } from '../components/hyper/WorkspaceSidebar';
const props = { user: null, selected: '', theme: 'light' as const, onTheme: vi.fn(), onToggle: vi.fn(), onSelect: vi.fn(), onRetry: vi.fn() };
const projects = (unread: boolean) => [{ id: 'unread-project', title: 'Workspace', dir: '/work', host: null, chats: [
  { id: 'a', title: 'Visible chat', model: '', runState: 'idle', hasUnread: false, lastReplyAt: null },
  { id: 'b', title: 'Other chat', model: '', runState: 'idle', hasUnread: unread, lastReplyAt: null },
] }];
it('marks the project when any chat is unread, including collapsed and search-hidden chats; clears when read', () => {
  localStorage.clear();
  const view = render(<WorkspaceSidebar {...props} projects={projects(true)} />);
  const heading = screen.getByRole('button', { name: 'Workspace' });
  expect(heading).toHaveClass('is-unread');
  fireEvent.click(heading); expect(heading).toHaveClass('is-unread');
  const search = view.container.querySelector('input')!;
  fireEvent.change(search, { target: { value: 'Visible chat' } });
  expect(screen.getByRole('button', { name: 'Workspace' })).toHaveClass('is-unread');
  view.rerender(<WorkspaceSidebar {...props} projects={projects(false)} />);
  expect(screen.getByRole('button', { name: 'Workspace' })).not.toHaveClass('is-unread');
  localStorage.clear();
});
