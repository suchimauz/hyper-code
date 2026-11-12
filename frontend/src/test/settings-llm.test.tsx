import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LlmConnectionsPanel } from '../components/settings/LlmConnectionsPanel';

const codex = { provider: 'codex', account: 'ssh.box.work', label: 'box · codex · work', source: 'ssh', sshInstance: 'box', available: true, needsReconnect: false, usedPercent: 89, resetsAt: null, windows: { primary: { usedPercent: 89, windowMinutes: 10080, resetsAt: null } }, planType: 'pro', parkedAgents: 0 };
const claude = { ...codex, provider: 'claude-code', account: 'personal', sshInstance: null, needsReconnect: true, windows: null, planType: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(state: { accounts?: unknown[]; logins?: unknown[]; instances?: string[]; proxies?:unknown[] }, post?: (body: any) => Response) {
  const calls: { method: string; body?: any; headers?: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if (_url === '/llms/settings') return json({models:[],disabledModels:[],instances:[],plans:{},tier:'standard',nodes:[],clients:[],csrfToken:'csrf'});
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

it('shows safe remote diagnostics and prevents callback replay while retaining cancel', async () => {
  const calls = mockApi({ logins: [{ id: 'r1', provider: 'claude-code', account: 'w', instance: 'box', status: 'pending', verificationUri: 'https://claude.ai/oauth/authorize', userCode: null, needsCode: false, callbackSubmitted: true, error: null, diagnostics: { startedAt: 1000, endedAt: null, exitCode: null, reason: 'tls', httpCode: null, stages: [{ phase: 'cli-login', startedAt: 1000, endedAt: null, exitCode: null }] } }] });
  render(<LlmConnectionsPanel />);
  fireEvent.click(await screen.findByText('Safe login diagnostics'));
  expect(screen.getByText(/TLS \/ certificate error/)).toBeVisible();
  expect(screen.getByText(/do not resend the callback/)).toBeVisible();
  expect(screen.queryByLabelText(/Callback URL/)).toBeNull();
  expect(calls.some(c => c.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel login' }));
  await waitFor(() => expect(calls.find(c => c.method === 'POST')?.body).toEqual({ action: 'cancel', id: 'r1' }));
});

it('submits remote callback privately with CSRF and clears the input', async () => {
  const calls = mockApi({ logins: [{ id: 'r1', provider: 'claude-code', account: 'w', instance: 'box', status: 'pending', verificationUri: 'https://claude.ai/oauth/authorize', needsCode: true, callbackSubmitted: false, error: null }] });
  render(<LlmConnectionsPanel />);
  const field = await screen.findByLabelText(/Callback URL/);
  fireEvent.change(field, { target: { value: 'http://localhost:123/callback?code=synthetic&state=test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(field).toHaveValue(''));
  expect(calls.find(c => c.method === 'POST')?.body).toEqual({ action: 'code', id: 'r1', code: 'http://localhost:123/callback?code=synthetic&state=test' });
  expect(calls.find(c => c.method === 'POST')?.headers['X-CSRF-Token']).toBe('csrf');
});

it('allows cancelling local Kimi device authorization', async () => {
  const calls = mockApi({ logins: [{ id: 'k1', provider: 'kimi-coding', account: 'w', instance: null, status: 'pending', verificationUri: 'https://auth.kimi.com', needsCode: false, callbackSubmitted: false, error: null }] });
  render(<LlmConnectionsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel login' }));
  await waitFor(() => expect(calls.find(c => c.method === 'POST')?.body).toEqual({ action: 'cancel', id: 'k1' }));
});

it('local Claude proxy forces OAuth; SSH clears and never sends proxy selection', async()=>{
 const calls=mockApi({instances:['box'],proxies:[{id:'p1',name:'Work proxy',host:'proxy.test',port:1080}]});
 render(<LlmConnectionsPanel/>);const group=await screen.findByRole('region',{name:'Claude'});
 fireEvent.click(within(group).getByRole('button',{name:/Add account/}));
 fireEvent.change(within(group).getByLabelText(/Account name/),{target:{value:'work'}});
 fireEvent.change(within(group).getByLabelText(/SOCKS5 proxy/),{target:{value:'p1'}});
 expect(within(group).getByLabelText(/Login method/)).toHaveValue('oauth');
 expect(within(group).getByRole('option',{name:'CLI'})).toBeDisabled();
 fireEvent.click(within(group).getByRole('button',{name:'Start login'}));
 await waitFor(()=>expect(calls.find(c=>c.method==='POST')?.body).toMatchObject({provider:'claude-code',method:'oauth',proxyId:'p1'}));
 fireEvent.click(within(group).getByRole('button',{name:/Add account/}));
 fireEvent.change(within(group).getByLabelText(/Account name/),{target:{value:'remote'}});
 fireEvent.change(within(group).getByLabelText(/SOCKS5 proxy/),{target:{value:'p1'}});
 fireEvent.change(within(group).getByLabelText(/SSH Instance/),{target:{value:'box'}});
 expect(within(group).queryByLabelText(/SOCKS5 proxy/)).not.toBeInTheDocument();
 fireEvent.click(within(group).getByRole('button',{name:'Start login'}));
 await waitFor(()=>expect(calls.filter(c=>c.method==='POST').at(-1)?.body).toEqual({action:'login',provider:'claude-code',account:'remote',instance:'box'}));
});
it('OAuth reconnect preserves route and never offers CLI or proxy changes',async()=>{
 const calls=mockApi({accounts:[{...claude,provider:'anthropic-oauth',proxy:{id:'p1',name:'Work proxy',host:'proxy.test',port:1080}}]});render(<LlmConnectionsPanel/>);
 const group=await screen.findByRole('region',{name:'Claude'});fireEvent.click(within(group).getByRole('button',{name:'Reconnect'}));
 expect(within(group).queryByLabelText(/SOCKS5 proxy/)).not.toBeInTheDocument();expect(within(group).queryByLabelText(/Login method/)).not.toBeInTheDocument();
 fireEvent.click(within(group).getAllByRole('button',{name:'Reconnect'}).at(-1)!);
 await waitFor(()=>expect(calls.find(c=>c.method==='POST')?.body).toEqual({action:'login',provider:'claude-code',account:'personal',method:'oauth'}));
});
