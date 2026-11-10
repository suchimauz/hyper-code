import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SshInstancesPanel } from '../components/settings/SshInstancesPanel';
import { SettingsDialog } from '../components/settings/SettingsDialog';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';

const pending = { name: 'box', host: 'h.example', user: 'run', port: 22, publicKey: 'ssh-ed25519 AAAA mauzcode', pinnedHostKey: null, updatedAt: 1 };
const verified = { ...pending, name: 'prod', pinnedHostKey: 'ssh-ed25519 KEY', updatedAt: 2 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(instances: unknown[], post?: (body: any) => Response) {
  const calls: { method: string; body?: any; headers?: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') { calls.push({ method }); return json({ instances, csrfToken: 'csrf' }); }
    const body = JSON.parse(String(init.body)); calls.push({ method, body, headers: init.headers });
    return post ? post(body) : json({ message: 'ok' });
  }));
  return calls;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('opens native LLM settings rather than navigating to the SSR shell', async () => {
  mockApi([]);
  const onTab = vi.fn();
  render(<SettingsDialog open tab="ssh-instances" onTab={onTab} onOpenChange={() => {}} />);
  await screen.findByRole('region', { name: 'Add SSH instance' });
  expect(document.querySelector('a[href="/llms"]')).toBeNull();
  fireEvent.click(within(document.querySelector('.settings-panel-header') as HTMLElement).getByRole('button', { name: 'LLM Connections' }));
  expect(onTab).toHaveBeenCalledWith('llm-connections');
});

it('renders instances with status badges and the public key for pending setup', async () => {
  mockApi([pending, verified]); render(<SshInstancesPanel />);
  const box = await screen.findByRole('article', { name: 'box' });
  expect(within(box).getByText('Setup required')).toBeVisible();
  expect(within(box).getByText('run@h.example:22')).toBeVisible();
  expect(within(box).getByLabelText('SSH public key')).toHaveTextContent('ssh-ed25519 AAAA mauzcode');
  expect(within(box).getByRole('button', { name: /Test connection/ })).toBeDisabled();
  const prod = screen.getByRole('article', { name: 'prod' });
  expect(within(prod).getByText('Host verified')).toBeVisible();
  expect(within(prod).getByRole('button', { name: /Test connection/ })).toBeEnabled();
});

it('shows the add form when empty and creates with CSRF', async () => {
  const calls = mockApi([], () => json({ message: 'Added locally.' }, 201)); render(<SshInstancesPanel />);
  const form = await screen.findByRole('region', { name: 'Add SSH instance' });
  fireEvent.change(within(form).getByLabelText(/Name/), { target: { value: 'box' } });
  fireEvent.change(within(form).getByLabelText('Host'), { target: { value: 'h.example' } });
  fireEvent.change(within(form).getByLabelText('User'), { target: { value: 'run' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Add instance' }));
  await screen.findByText('Added locally.');
  const write = calls.find(c => c.method === 'POST')!;
  expect(write.body).toEqual({ action: 'create', name: 'box', host: 'h.example', user: 'run', port: 22 });
  expect(write.headers['X-CSRF-Token']).toBe('csrf');
});

it('requires explicit confirmation before trusting a host key', async () => {
  const calls = mockApi([pending]); render(<SshInstancesPanel />);
  const box = await screen.findByRole('article', { name: 'box' });
  fireEvent.click(within(box).getByRole('button', { name: 'Verify host key' }));
  fireEvent.change(within(box).getByLabelText('Host public key'), { target: { value: ' ssh-ed25519 KEY ' } });
  const submit = within(box).getAllByRole('button', { name: 'Verify host key' }).at(-1)!;
  expect(submit).toBeDisabled();
  fireEvent.click(within(box).getByRole('checkbox'));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true));
  expect(calls.find(c => c.method === 'POST')!.body).toEqual({ action: 'trust', name: 'box', hostKey: 'ssh-ed25519 KEY', confirmed: true });
});

it('removal needs a checkbox and errors are shown inline', async () => {
  const calls = mockApi([verified], () => json({ error: 'Instance is busy' }, 422)); render(<SshInstancesPanel />);
  const prod = await screen.findByRole('article', { name: 'prod' });
  fireEvent.click(within(prod).getByRole('button', { name: 'Remove' }));
  const submit = within(prod).getByRole('button', { name: 'Remove instance' });
  expect(submit).toBeDisabled();
  fireEvent.click(within(prod).getByRole('checkbox'));
  fireEvent.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('Instance is busy');
  expect(calls.find(c => c.method === 'POST')!.body).toEqual({ action: 'remove', name: 'prod', confirmed: true });
});

it('shows probe results', async () => {
  mockApi([verified], () => json({ message: 'Remote check done', probe: { python3: true, codex: false, claude: true } })); render(<SshInstancesPanel />);
  const prod = await screen.findByRole('article', { name: 'prod' });
  fireEvent.click(within(prod).getByRole('button', { name: /Test connection/ }));
  const list = await screen.findByRole('list', { name: 'Результат проверки' });
  expect(within(list).getByText('codex').closest('li')).toHaveClass('is-missing');
});

it('explains owner-only access on 403', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Only owners can manage SSH instances' }, 403)));
  render(<SshInstancesPanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Только владелец');
});

it('settings modal is a labelled dialog that closes with the close button and Escape', async () => {
  mockApi([]); const onOpenChange = vi.fn();
  render(<SettingsDialog open tab="ssh-instances" onTab={vi.fn()} onOpenChange={onOpenChange} />);
  const dialog = await screen.findByRole('dialog', { name: 'Settings' });
  expect(within(dialog).getByRole('button', { name: /SSH Instances/ })).toHaveAttribute('aria-current', 'true');
  expect(await within(dialog).findByRole('heading', { name: 'SSH Instances' })).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть настройки' }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.anything());
  onOpenChange.mockClear();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything()));
});

it('account menu offers Settings', async () => {
  const onOpenSettings = vi.fn();
  render(<WorkspaceSidebar projects={[]} selected="" user={{ name: 'Ann Owner', role: 'owner' } as any} onOpenSettings={onOpenSettings} onSelect={vi.fn()} onToggle={vi.fn()} onRetry={vi.fn()} theme="light" onTheme={vi.fn()} loading={false} error="" />);
  fireEvent.click(screen.getByRole('button', { name: 'Профиль: Ann Owner' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  expect(onOpenSettings).toHaveBeenCalledOnce();
});
