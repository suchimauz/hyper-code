import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LlmConnectionsPanel } from '../components/settings/LlmConnectionsPanel';

const codex = { provider: 'codex', account: 'ssh.box.work', label: 'box · codex · work', source: 'ssh', sshInstance: 'box', available: true, needsReconnect: false, usedPercent: 89, resetsAt: null, windows: { primary: { usedPercent: 89, windowMinutes: 10080, resetsAt: null } }, planType: 'pro', parkedAgents: 0 };
const claude = { ...codex, provider: 'claude-code', account: 'personal', sshInstance: null, needsReconnect: true, windows: null, planType: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(state: { accounts?: unknown[]; logins?: unknown[]; instances?: string[] }, post?: (body: any) => Response) {
  const calls: { method: string; body?: any; headers?: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if (_url === '/llms/settings') return json({models:[],disabledModels:[],instances:[],plans:{},tier:'standard',nodes:[],csrfToken:'csrf'});
    const method = init.method || 'GET';
    if (method === 'GET') { calls.push({ method }); return json({ accounts: [], logins: [], instances: [], ...state, csrfToken: 'csrf' }); }
    const body = JSON.parse(String(init.body)); calls.push({ method, body, headers: init.headers });
    return post ? post(body) : json({ message: 'ok' });
  }));
  return calls;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('groups accounts by provider with SSH tag, quota and reconnect state', async () => {
  mockApi({ accounts: [codex, claude] }); render(<LlmConnectionsPanel />);
  const group = await screen.findByRole('region', { name: 'Codex' });
  expect(within(group).getByText('work')).toBeVisible();
  expect(within(group).getByText('SSH · box')).toBeVisible();
  expect(within(group).getByText('weekly 89%')).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Claude' })).getByText('authentication required')).toBeVisible();
});

it('starts a login on the chosen SSH instance with CSRF', async () => {
  const calls = mockApi({ instances: ['box'] }, () => json({ id: 'r1', message: 'Authorization started on the SSH instance.' }, 201));
  render(<LlmConnectionsPanel />);
  const group = await screen.findByRole('region', { name: 'Codex' });
  fireEvent.click(within(group).getByRole('button', { name: /Add account/ }));
  fireEvent.change(within(group).getByLabelText(/Account name/), { target: { value: 'work' } });
  fireEvent.change(within(group).getByLabelText(/SSH Instance/), { target: { value: 'box' } });
  fireEvent.click(within(group).getByRole('button', { name: 'Start login' }));
  await waitFor(() => expect(calls.find(c => c.method === 'POST')?.body).toEqual({ action: 'login', provider: 'codex', account: 'work', instance: 'box' }));
  expect(calls.find(c => c.method === 'POST')?.headers['X-CSRF-Token']).toBe('csrf');
});

it('shows a pending login link, device code and secret code field', async () => {
  mockApi({ logins: [{ id: 'r1', provider: 'claude-code', account: 'w', instance: 'box', status: 'pending', verificationUri: 'https://claude.ai/oauth/authorize', userCode: 'ABCD', needsCode: true, callbackSubmitted: false, error: null }] });
  render(<LlmConnectionsPanel />);
  const link = await screen.findByRole('link', { name: /Open authorization page/ });
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('ABCD')).toBeVisible();
  expect(screen.getByLabelText(/Callback URL/)).toHaveAttribute('type', 'password');
});

it('removes an account only after confirmation, archiving its agents', async () => {
  const calls = mockApi({ accounts: [codex] }, body => body.action === 'users' ? json({ users: [{ id: 'ag', title: 'Agent', model: null }] }) : json({ message: 'Account removed.' }));
  render(<LlmConnectionsPanel />);
  const group = await screen.findByRole('region', { name: 'Codex' });
  fireEvent.click(within(group).getByRole('button', { name: 'Remove' }));
  const submit = await within(group).findByRole('button', { name: 'Remove account' });
  await within(group).findByText('Agent');
  expect(submit).toBeDisabled();
  fireEvent.click(within(group).getByRole('checkbox'));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some(c => c.body?.action === 'remove')).toBe(true));
  expect(calls.find(c => c.body?.action === 'remove')?.body).toEqual({ action: 'remove', provider: 'codex', account: 'ssh.box.work', confirmed: true, archiveUsers: true });
});

it('explains that only owners can manage connections', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Only owners' }, 403)));
  render(<LlmConnectionsPanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Только владелец');
});
