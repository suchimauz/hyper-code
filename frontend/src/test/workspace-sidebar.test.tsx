import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSidebar } from '../components/hyper/WorkspaceSidebar';
import { AppShell } from '../components/layout/AppShell';
import { filterProjects, replyAge, type NavigationProject } from '../lib/navigation';

const projects: NavigationProject[] = [
  { id: 'local', title: 'UI lab', dir: '/works/ui', host: null, chats: [{ id: 'ab', title: 'Navigation design', model: '', runState: 'running', hasUnread: true, lastReplyAt: 1700000000000 }, { id: 'ac', title: 'Composer', model: '', runState: 'idle', hasUnread: false, lastReplyAt: null }, { id: 'old', title: 'Archived chat', model: '', runState: 'idle', hasUnread: false, archived: true, lastReplyAt: null }] },
  { id: 'remote', title: 'UI lab remote', dir: '/works/ui', host: 'home-dev', chats: [{ id: 'ba', title: 'Backend', model: '', runState: 'idle', hasUnread: false, lastReplyAt: null }] },
];
const props = { projects, user: { name: 'Test User', role: 'owner' as const }, selected: 'ab', theme: 'light' as const, onTheme: vi.fn(), onToggle: vi.fn(), onSelect: vi.fn(), onRetry: vi.fn() };
afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });
it('filters agent titles, IDs and workspace names without merging same paths on different hosts', () => {
  expect(filterProjects(projects, 'navigation', false).map(p => p.chats.map(c => c.id))).toEqual([['ab']]);
  expect(filterProjects(projects, 'UI lab', false)).toHaveLength(2);
  expect(filterProjects(projects, 'home-dev', false).map(p => p.id)).toEqual(['remote']);
  expect(filterProjects(projects, 'ac', false)[0].chats.map(c => c.id)).toEqual(['ac']);
  expect(filterProjects(projects, '', true)[0].chats.map(c => c.id)).toEqual(['old']);
});
it('formats only actual reply times, including missing and future timestamps', () => {
  const now = 1700000000000;
  expect(replyAge(null, now)).toBe('—'); expect(replyAge(now + 1000, now)).toBe('now');
  expect(replyAge(now - 120000, now)).toBe('2m'); expect(replyAge(now - 10800000, now)).toBe('3h'); expect(replyAge(now - 172800000, now)).toBe('2d');
});
it('renders icon, ID, title and reply date; searches closed workspaces and keeps selection functional', async () => {
  render(<WorkspaceSidebar {...props} />);
  const chat = screen.getByRole('button', { name: /ab Navigation design/ });
  expect(chat).toHaveAttribute('aria-current', 'page'); expect(chat.querySelector('svg')).not.toBeNull();
  expect(chat.querySelector('time')).toHaveAttribute('datetime', new Date(1700000000000).toISOString());
  const heading = screen.getByRole('button', { name: 'UI lab' }); fireEvent.click(heading);
  expect(screen.queryByRole('button', { name: /ab Navigation design/ })).toBeNull();
  await userEvent.type(screen.getByRole('textbox'), 'navigation');
  fireEvent.click(screen.getByRole('button', { name: /ab Navigation design/ })); expect(props.onSelect).toHaveBeenCalledWith('ab');
  fireEvent.click(screen.getByRole('button', { name: 'Очистить фильтр' })); expect(heading).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Archived' })); fireEvent.click(heading);
  expect(screen.getByRole('button', { name: /old Archived chat/ })).toBeVisible();
});
it('compact rail retains New Session and expand controls without Search without displaying a second chat list', () => {
  render(<AppShell workspaceNav sidebarCompact sidebar={<WorkspaceSidebar {...props} compact />}><div>Chat</div></AppShell>);
  expect(document.querySelector('.app-shell')).toHaveClass('app-shell--compact');
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть навбар' })); expect(props.onToggle).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'New Session' })); expect(props.onSelect).not.toHaveBeenCalled();
});
it('opens profile by hover, uses actual identity and native POST logout; hides People for members', async () => {
  const onOpenPeople = vi.fn();
  const view = render(<WorkspaceSidebar {...props} onOpenPeople={onOpenPeople} />);
  await userEvent.hover(screen.getByRole('button', { name: 'Профиль: Test User' }));
  await userEvent.click(await screen.findByRole('button', { name: 'People' }));
  expect(onOpenPeople).toHaveBeenCalledOnce();
  await userEvent.hover(screen.getByRole('button', { name: 'Профиль: Test User' }));
  const logout = (await screen.findByRole('button', { name: 'Sign out' })).closest('form');
  expect(logout).toHaveAttribute('method', 'post'); expect(logout).toHaveAttribute('action', '/auth/logout');
  view.unmount(); render(<WorkspaceSidebar {...props} user={{ name: 'Member Name', role: 'member' }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Профиль: Member Name' }));
  expect(screen.queryByRole('button', { name: 'People' })).toBeNull();
});

it('defaults to the selected workspace and restores explicit open and closed choices after remount', () => {
  const view = render(<WorkspaceSidebar {...props} />);
  expect(screen.getByRole('button', { name: 'UI lab' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'UI lab remote' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'UI lab' }));
  fireEvent.click(screen.getByRole('button', { name: 'UI lab remote' }));
  view.unmount();
  render(<WorkspaceSidebar {...props} />);
  expect(screen.getByRole('button', { name: 'UI lab' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'UI lab remote' })).toHaveAttribute('aria-expanded', 'true');
});
it('synchronizes mounted desktop/mobile lists and retains choices after compact mode', () => {
  const view = render(<><WorkspaceSidebar {...props} /><WorkspaceSidebar {...props} mobile /></>);
  fireEvent.click(screen.getAllByRole('button', { name: 'UI lab' })[0]);
  for (const heading of screen.getAllByRole('button', { name: 'UI lab' })) expect(heading).toHaveAttribute('aria-expanded', 'false');
  view.rerender(<WorkspaceSidebar {...props} compact />);
  view.rerender(<WorkspaceSidebar {...props} />);
  expect(screen.getByRole('button', { name: 'UI lab' })).toHaveAttribute('aria-expanded', 'false');
});
it('search expansion does not overwrite the saved workspace selection', async () => {
  localStorage.setItem('hyper.ui.workspace.local', 'closed');
  render(<WorkspaceSidebar {...props} />);
  await userEvent.type(screen.getByRole('textbox'), 'navigation');
  const heading = screen.getByRole('button', { name: 'UI lab' });
  expect(heading).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(heading);
  expect(localStorage.getItem('hyper.ui.workspace.local')).toBe('closed');
  fireEvent.click(screen.getByRole('button', { name: 'Очистить фильтр' }));
  expect(heading).toHaveAttribute('aria-expanded', 'false');
});
it('new session heading control passes exact project and global control passes no event', async () => {
  const onNewSession = vi.fn(); render(<WorkspaceSidebar {...props} onNewSession={onNewSession} />);
  await userEvent.click(screen.getByRole('button', {name:'New session in UI lab'}));
  expect(onNewSession).toHaveBeenLastCalledWith('local');
  await userEvent.click(screen.getByRole('button', {name:'New Session'}));
  expect(onNewSession).toHaveBeenLastCalledWith();
});
it('project archive icon does not send a chat action and keeps archived active chats truthful', async () => {
  const onProjectAction=vi.fn(),onAction=vi.fn();
  const archivedProjects=[{...projects[0],archived:true}];
  render(<WorkspaceSidebar {...props} projects={archivedProjects} onProjectAction={onProjectAction} onAction={onAction} />);
  expect(screen.queryByText('UI lab')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Archived'}));
  expect(screen.getByRole('button',{name:/ab Navigation design/})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'New session in UI lab'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Restore workspace UI lab'}));
  expect(onProjectAction).toHaveBeenCalledWith('local','restore');expect(onAction).not.toHaveBeenCalled();
});
it('project archive preserves all chat flags and restores their original view membership',()=>{
  const archived=[{...projects[0],archived:true}];
  expect(filterProjects(archived,'',false)).toEqual([]);
  expect(filterProjects(archived,'',true)[0].chats.map(c=>c.id)).toEqual(['ab','ac','old']);
  const restored=[{...archived[0],archived:false}];
  expect(filterProjects(restored,'',false)[0].chats.map(c=>c.id)).toEqual(['ab','ac']);
  expect(filterProjects(restored,'',true)[0].chats.map(c=>c.id)).toEqual(['old']);
  expect(archived[0].chats).toBe(projects[0].chats);
});
it('unassigned virtual group offers no project creation or archive action',()=>{
  render(<WorkspaceSidebar {...props} projects={[{...projects[0],id:'unassigned',dir:'',virtual:true}]} onNewSession={vi.fn()} onProjectAction={vi.fn()} />);
  expect(screen.queryByRole('button',{name:'Archive workspace UI lab'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'New session in UI lab'})).not.toBeInTheDocument();
});
