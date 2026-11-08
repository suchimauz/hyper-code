import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ChatHeader } from '../components/hyper/ChatHeader';
import { getChatHeader, renameChat } from '../lib/chatHeader';
vi.mock('../lib/chatHeader', () => ({ getChatHeader: vi.fn(), renameChat: vi.fn() }));
const child = { tokens: 341000, durationMs: 152000, modelLabel: 'GPT', id: 'ab', title: 'Проверка API', runState: 'idle', colorHue: 40, icon: { src: 'data:image/svg+xml,%3Csvg/%3E', custom: true } };
const props = () => ({ agentId: 'root', title: 'Работа', canvasOpen: false, onCanvas: vi.fn(), onSelect: vi.fn(), onRenamed: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getChatHeader).mockResolvedValue({ agentId: 'root', title: 'Работа', children: [child], csrfToken: 'csrf' }); vi.mocked(renameChat).mockResolvedValue({ agentId: 'root', title: 'Новое имя' }); });
it('shows only Chat and opens real children with icon, id and title', async () => {
  const p = props(); render(<ChatHeader {...p} />); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '1 subagent' }));
  const row = screen.getByRole('button', { name: /^ab Проверка API/ });
  expect(row.querySelector('img')).toHaveAttribute('src', child.icon.src);
  expect(screen.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible(); expect(screen.getByText('341K tok')).toBeVisible(); expect(screen.getByText('2m 32s')).toBeVisible(); expect(screen.queryByText('Trajectory')).not.toBeInTheDocument();
  await user.click(row); expect(p.onSelect).toHaveBeenCalledWith('ab');
  await user.click(screen.getByRole('button', { name: 'Открыть Canvas' })); expect(p.onCanvas).toHaveBeenCalledOnce();
});
it('renames with Enter and native csrf, refreshes the navigation', async () => {
  const p = props(); render(<ChatHeader {...p} />); const user = userEvent.setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Переименовать чат: Работа' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Переименовать чат: Работа' }));
  const input = screen.getByRole('textbox', { name: 'Название чата' }); await user.clear(input); await user.type(input, 'Новое имя{Enter}');
  await waitFor(() => expect(renameChat).toHaveBeenCalledExactlyOnceWith('root', 'Новое имя', 'csrf'));
  expect(p.onRenamed).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: 'Переименовать чат: Новое имя' })).toBeVisible();
});
it('Escape cancels without a write and returns focus', async () => {
  render(<ChatHeader {...props()} />); const user = userEvent.setup();
  const button = screen.getByRole('button', { name: 'Переименовать чат: Работа' }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  await user.type(screen.getByRole('textbox'), 'x{Escape}'); expect(renameChat).not.toHaveBeenCalled(); expect(button).toHaveFocus();
});
it('keeps failed edits available for retry, while blur saves once', async () => {
  vi.mocked(renameChat).mockRejectedValue(new Error('Сбой сохранения')); render(<ChatHeader {...props()} />); const user = userEvent.setup();
  const button = screen.getByRole('button', { name: 'Переименовать чат: Работа' }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  const input = screen.getByRole('textbox'); fireEvent.change(input, { target: { value: 'Изменение' } }); fireEvent.blur(input);
  expect(await screen.findByRole('alert')).toHaveTextContent('Сбой сохранения'); expect(input).toHaveValue('Изменение'); expect(renameChat).toHaveBeenCalledOnce();
});
it('does not load or edit a new session', () => { render(<ChatHeader {...props()} agentId="" title="New Session" canvasDisabled />); expect(getChatHeader).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'New Session' })).toBeDisabled(); });
it('opens on hover and separates side-panel action from row navigation', async () => {
  const p = props(), onOpenSide = vi.fn(); render(<ChatHeader {...p} onOpenSide={onOpenSide} />); const user = userEvent.setup();
  await user.hover(await screen.findByRole('button', { name: '1 subagent' }));
  const side = await screen.findByRole('button', { name: 'Открыть Проверка API в боковой панели' });
  await user.click(side); expect(onOpenSide).toHaveBeenCalledWith('ab', 'Проверка API'); expect(p.onSelect).not.toHaveBeenCalled();
});
it('returns to the actual parent from a direct child URL', async () => {
  vi.mocked(getChatHeader).mockResolvedValue({ agentId: 'root', title: 'Работа', children: [], csrfToken: 'csrf', parent: { id: 'parent', title: 'Главный чат' }, siblings: [child] });
  const p = props(); render(<ChatHeader {...p} />); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Главный чат' })); expect(p.onSelect).toHaveBeenCalledWith('parent');
});
it('shows only own children, never siblings, with a running indicator', async () => {
  vi.mocked(getChatHeader).mockResolvedValue({ agentId: 'root', title: 'Работа', children: [{ ...child, id: 'own', title: 'Свой ребёнок', runState: 'running' }], csrfToken: 'csrf', parent: { id: 'parent', title: 'Родитель' }, siblings: [{ ...child, title: 'Сосед' }] });
  render(<ChatHeader {...props()} />); const user = userEvent.setup();
  expect(await screen.findByRole('img', { name: 'Сабагенты работают' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /1 subagent/ }));
  expect(screen.getByRole('button', { name: /own Свой ребёнок/ })).toBeVisible(); expect(screen.queryByText('Сосед')).not.toBeInTheDocument();
});
it('hides the list when a child has siblings but no children of its own', async () => {
  vi.mocked(getChatHeader).mockResolvedValue({ agentId: 'root', title: 'Работа', children: [], csrfToken: 'csrf', parent: { id: 'parent', title: 'Родитель' }, siblings: [child] });
  render(<ChatHeader {...props()} />);
  expect(await screen.findByRole('button', { name: 'Родитель' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /subagent/ })).not.toBeInTheDocument(); expect(screen.queryByRole('img', { name: 'Сабагенты работают' })).not.toBeInTheDocument();
});
it('uses the navigation running icon in the title and clears it when idle', () => {
  const p = props(); const view = render(<ChatHeader {...p} active />);
  expect(document.querySelector('.chat-header-identity .navigation-chat-icon')).toHaveClass('is-running');
  view.rerender(<ChatHeader {...p} active={false} />);
  expect(document.querySelector('.chat-header-identity .navigation-chat-icon')).not.toHaveClass('is-running');
});
