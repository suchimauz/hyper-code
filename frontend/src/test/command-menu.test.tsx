import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../components/hyper/MessageInput';
import { LiveComposer } from '../components/hyper/LiveComposer';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
import { validateCommand } from '../lib/commands';
vi.mock('../components/hyper/ModelPicker', () => ({ ModelPicker: () => null }));
const catalogue = { version: 1, csrfToken: 'test-csrf', commands: [
  { name: 'plan', description: 'Plan', usage: ['/plan'], attachments: false },
  { name: 'compact', description: 'Compact', usage: ['/compact'], attachments: false },
] };
const json = (value: object, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
function Editor({ send = vi.fn(), file = vi.fn(), compact = vi.fn(), running = false, initial = '' }: { send?: () => void; file?: () => void; compact?: () => void; running?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial); const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(v => !v)}>Добавить</button><MessageInput commandsEnabled value={value} onChange={setValue} onSend={send} commandMenuOpen={open} onCommandMenuClose={() => setOpen(false)} onFile={file} onCompact={compact} running={running} /></>;
}
function input(text: string) { fireEvent.input(screen.getByRole('textbox'), { target: { textContent: text } }); }
const optionNames = () => screen.getAllByRole('option').map(row => row.querySelector('.command-menu-name')?.textContent);
it('plus and slash expose the same grouped entries in the same order without altering the draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor initial="existing draft" />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  await screen.findByRole('option', { name: /Plan/ });
  expect(optionNames()).toEqual(['File', 'Plan', 'Goal', 'Compact']);
  expect(screen.getByRole('group', { name: 'Add' })).toHaveTextContent('File');
  expect(screen.getByRole('group', { name: 'Commands' })).toHaveTextContent('Compact');
  expect(screen.getByRole('textbox').textContent).toBe('existing draft');
  screen.getByRole('textbox').focus(); await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  input('/'); await screen.findByRole('option', { name: /Plan/ });
  expect(optionNames()).toEqual(['File', 'Plan', 'Goal', 'Compact']);
});
it('claims Plan as an atomic chip with keyboard, without submitting or invoking twice', async () => {
  const fetcher = vi.fn(async () => json(catalogue)); vi.stubGlobal('fetch', fetcher); const send = vi.fn(); render(<Editor send={send} />);
  expect(fetcher).not.toHaveBeenCalled(); await userEvent.type(screen.getByRole('textbox'), '/');
  expect(await screen.findByRole('option', { name: 'File' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('/plan ');
  expect(screen.getByRole('textbox').querySelector('[data-composer-command]')).toHaveProperty('contentEditable', 'false');
  expect(screen.queryByRole('listbox')).toBeNull();
  await userEvent.keyboard('test{Enter}'); expect(send).toHaveBeenCalledOnce();
});
it('plus Plan preserves existing text and pointer selection focuses the editor', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor initial="my task" />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' })); await userEvent.click(await screen.findByRole('option', { name: /Plan/ }));
  expect(screen.getByRole('textbox').textContent).toBe('/plan my task'); expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('textbox').querySelectorAll('[data-composer-command]')).toHaveLength(1);
});
it('supports Escape and filtering unknown names', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor />);
  await userEvent.type(screen.getByRole('textbox'), '/'); await screen.findByRole('option', { name: /Plan/ });
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('listbox')).toBeNull(); expect(screen.getByRole('textbox').textContent).toBe('/');
  await userEvent.type(screen.getByRole('textbox'), 'xyz'); expect(await screen.findByText('Команда не найдена')).toBeVisible();
});
it.each(['File', 'Compact'])('plus %s invokes its local callback once, immediately, without sending or changing the draft', async name => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const file = vi.fn(), compact = vi.fn(), send = vi.fn();
  render(<Editor initial="keep this" file={file} compact={compact} send={send} />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' })); await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));
  expect(name === 'File' ? file : compact).toHaveBeenCalledOnce(); expect(name === 'File' ? compact : file).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('keep this'); expect(screen.queryByRole('listbox')).toBeNull();
});
it('slash Compact immediately invokes the callback and consumes only the command trigger', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const compact = vi.fn(), send = vi.fn(); render(<Editor compact={compact} send={send} />);
  await userEvent.type(screen.getByRole('textbox'), '/compact'); await userEvent.click(await screen.findByRole('option', { name: /^Compact/ }));
  expect(compact).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('');
});
it('Compact stays unavailable during a run for both pointer and keyboard', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const compact = vi.fn(); render(<Editor running compact={compact} />);
  await userEvent.type(screen.getByRole('textbox'), '/compact'); const row = await screen.findByRole('option', { name: /^Compact/ });
  expect(row).toHaveAttribute('aria-disabled', 'true'); await userEvent.click(row); await userEvent.keyboard('{Enter}');
  expect(compact).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('/compact');
});
it('never sends a slash as a prompt when catalogue loading fails, preserving draft', async () => {
  const fetcher = vi.fn(async (url: string) => url.endsWith('/context') ? json({ budget: null }) : json({ error: 'offline' }, 503)); vi.stubGlobal('fetch', fetcher);
  render(<LiveComposer agentId="slash-test" running={false} onAccepted={vi.fn()} />); input('/plan задача');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('offline'); expect(screen.getByRole('textbox').textContent).toBe('/plan задача');
  expect(fetcher.mock.calls.every(call => String(call[0]) === '/commands' || String(call[0]).endsWith('/context'))).toBe(true);
});
it('validates unknown commands and attachments but does not load catalogue for ordinary text', async () => {
  const fetcher = vi.fn(async () => json(catalogue)); vi.stubGlobal('fetch', fetcher);
  await validateCommand('hello'); expect(fetcher).not.toHaveBeenCalled();
  await expect(validateCommand('/plna')).rejects.toThrow('Неизвестная команда');
  await expect(validateCommand('/plan', 1)).rejects.toThrow('пока не принимает файлы');
  await expect(validateCommand('/plan задача')).resolves.toBeUndefined();
});
it('posts commands through the CSRF-protected endpoint, preserving the request ID on uncertain retry', async () => {
  const bodies: { text: string; requestId: string }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/commands') return json(catalogue);
    if (url.endsWith('/context')) return json({ budget: null });
    expect(url).toBe('/agent/slash-test/commands'); expect(init?.method).toBe('POST'); expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('test-csrf');
    bodies.push(JSON.parse(init!.body as string)); if (bodies.length === 1) throw new Error('offline');
    return json({ ok: true, command: 'plan', status: 'completed', operationId: 'operation' });
  }); vi.stubGlobal('fetch', fetcher);
  const accepted = vi.fn(); const change = vi.fn(); window.addEventListener('hyper-planning-changed', change);
  try {
    render(<LiveComposer agentId="slash-test" running={false} onAccepted={accepted} />); input('/plan task');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline'); expect(screen.getByRole('textbox').textContent).toBe('/plan task');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledOnce()); expect(change).toHaveBeenCalledOnce();
    expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(bodies[0].text).toBe('/plan task'); expect(bodies[0].requestId).toBeTruthy();
    expect(screen.getByRole('textbox').textContent).toBe('');
  } finally { window.removeEventListener('hyper-planning-changed', change); }
});
it('rejects command while running and offers explicit stop, preserving draft', async () => {
  const fetcher = vi.fn(async (_url: string) => json({ budget: null })); vi.stubGlobal('fetch', fetcher);
  render(<LiveComposer agentId="running" running onAccepted={vi.fn()} />); input('/plan задача');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сначала остановите'); expect(screen.getByRole('button', { name: 'Остановить выполнение' })).toBeEnabled();
  expect(fetcher.mock.calls.every(call => String(call[0]).endsWith('/context'))).toBe(true); expect(screen.getByRole('textbox').textContent).toBe('/plan задача');
});
