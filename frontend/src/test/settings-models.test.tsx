import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createExtensionRegistry } from '../extensions/registry';
import type { ExtensionModelProviderProps, UiExtension } from '../extensions/types';

const pluginUi = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => pluginUi.current }));

import { ModelsPanel, UsageView } from '../components/settings/ModelsPanel';
import { SETTINGS_TABS, SettingsDialog } from '../components/settings/SettingsDialog';

const custom = { id: 'custom', label: 'Custom', description: 'Compatible API', fields: [
  { key: 'baseUrl', label: 'API base URL', type: 'url', required: true },
  { key: 'apiKey', label: 'API key', type: 'secret' },
  { key: 'protocol', label: 'Protocol', type: 'select', required: true, default: 'openai-chat', options: [{ value: 'openai-chat', label: 'OpenAI Chat' }, { value: 'anthropic', label: 'Anthropic' }] },
], transports: ['direct', 'socks', 'ssh-tunnel'], actions: [] };
const acme = { id: 'acme', label: 'Acme', fields: [{ key: 'region', label: 'Region', type: 'text' }], transports: ['direct'], actions: [] };
const stored = { id: 'c1', provider: 'custom', providerRegistered: true, accountName: 'Work', config: { baseUrl: 'https://api.example', protocol: 'anthropic' }, secrets: { apiKey: true }, transport: { kind: 'direct' }, enabled: true, createdAt: 1, updatedAt: 2 };
const context = { agentId: null, theme: 'light' as const, readOnly: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(connections: unknown[], providers: unknown[] = [custom], usage: unknown = { status: 'configured', reason: 'not-tested', checkedAt: 1 }) {
  const posts: { body: any; headers: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if ((init.method || 'GET') === 'GET') return json({ providers, connections, proxies: [{ id: 'p1', name: 'Office', host: 'proxy', port: 1080 }], instances: ['box'], csrfToken: 'csrf' });
    const body = JSON.parse(String(init.body)); posts.push({ body, headers: init.headers });
    if (body.action === 'usage') return json({ usage });
    if (body.action === 'create') return json({ connection: { ...stored, id: 'c2', accountName: body.accountName } }, 201);
    if (body.action === 'update') return json({ connection: { ...stored, ...body } });
    if (body.action === 'remove') return json({ removed: body.id });
    if (body.action === 'test') return json({ result: { status: 'available', reason: 'models-ok', message: 'Model discovery succeeded', checkedAt: 2 } });
    return json({ error: 'unexpected' }, 400);
  }));
  return posts;
}
beforeEach(() => { pluginUi.current = { registry: createExtensionRegistry([], {}), applications: {}, errors: {}, loaded: true }; });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('lists Models next to the unchanged LLM Connections tab', async () => {
  const ids = SETTINGS_TABS.map(t => t.id);
  expect(ids).toContain('llm-connections'); expect(ids).toContain('models');
  mockApi([]);
  render(<SettingsDialog open tab="models" onTab={() => {}} onOpenChange={() => {}} />);
  expect(screen.getByRole('button', { name: 'LLM Connections' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Models' })).toHaveAttribute('aria-current', 'true');
  expect(await screen.findByRole('heading', { name: 'Models' })).toBeVisible();
});

it('renders a schema form and creates a connection with a CSRF token, without reload', async () => {
  const posts = mockApi([]);
  render(<ModelsPanel context={context} />);
  const form = await screen.findByRole('form', { name: 'New Custom connection' });
  fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Mine' } });
  fireEvent.change(within(form).getByLabelText('API base URL'), { target: { value: 'https://llm.example' } });
  fireEvent.change(within(form).getByLabelText('API key'), { target: { value: 'sk-123' } });
  expect(within(form).getByLabelText('Protocol')).toHaveValue('openai-chat');
  fireEvent.click(within(form).getByRole('radio', { name: 'SOCKS5 proxy' }));
  expect(within(form).getByLabelText('Saved proxy')).toHaveValue('p1');
  fireEvent.submit(form);
  await waitFor(() => expect(posts.some(p => p.body.action === 'create')).toBe(true));
  const create = posts.find(p => p.body.action === 'create')!;
  expect(create.headers['X-CSRF-Token']).toBe('csrf');
  expect(create.body).toMatchObject({ provider: 'custom', accountName: 'Mine', config: { baseUrl: 'https://llm.example', protocol: 'openai-chat' }, secrets: { apiKey: 'sk-123' }, transport: { kind: 'socks', proxyId: 'p1' } });
});

it('keeps a stored secret write-only: empty input omits it, clearing sends null', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const form = within(card).getByRole('form', { name: 'Edit Work' });
  const key = within(form).getByLabelText('API key');
  expect(key).toHaveValue(''); expect(key).toHaveAttribute('type', 'password'); expect(key).toHaveAttribute('placeholder', expect.stringContaining('Stored'));
  expect(within(form).getByLabelText('Protocol')).toHaveValue('anthropic');
  expect(document.body.textContent).not.toContain('sk-');
  fireEvent.submit(form);
  await waitFor(() => expect(posts.some(p => p.body.action === 'update')).toBe(true));
  expect(posts.find(p => p.body.action === 'update')!.body.secrets).toEqual({});
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const again = within(card).getByRole('form', { name: 'Edit Work' });
  fireEvent.click(within(again).getByLabelText('Clear stored API key'));
  fireEvent.submit(again);
  await waitFor(() => expect(posts.filter(p => p.body.action === 'update')).toHaveLength(2));
  expect(posts.filter(p => p.body.action === 'update')[1].body.secrets).toEqual({ apiKey: null });
});

it('removes only after explicit confirmation, with focus on the confirm button', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: 'Remove' }));
  expect(posts.some(p => p.body.action === 'remove')).toBe(false);
  const confirm = within(card).getByRole('button', { name: 'Remove connection' });
  await waitFor(() => expect(confirm).toHaveFocus());
  fireEvent.click(confirm);
  await waitFor(() => expect(posts.find(p => p.body.action === 'remove')?.body).toEqual({ action: 'remove', id: 'c1', confirmed: true }));
});

it('tests a connection and toggles enabled', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: /Test/ }));
  expect(await screen.findByText('Work: Model discovery succeeded')).toBeVisible();
  fireEvent.click(within(card).getByRole('switch', { name: 'Enabled' }));
  await waitFor(() => expect(posts.find(p => p.body.action === 'update')?.body).toEqual({ action: 'update', id: 'c1', enabled: false }));
});

it('shows quota windows, or only status and reason without windows', () => {
  const { rerender } = render(<UsageView usage={{ status: 'available', checkedAt: 1, windows: [{ label: '5h', usedPercent: 42, resetAt: 2 }] }} />);
  expect(screen.getByRole('meter', { name: '5h used' })).toHaveAttribute('aria-valuenow', '42');
  expect(screen.getByText(/42% used · resets/)).toBeVisible();
  rerender(<UsageView usage={{ status: 'unavailable', reason: 'models-failed', checkedAt: 1 }} />);
  expect(screen.queryByRole('list', { name: 'Quota windows' })).toBeNull();
  expect(screen.getByText('Unavailable')).toBeVisible(); expect(screen.getByText('models-failed')).toBeVisible();
});

it('uses a granted plugin component for its provider and the schema form otherwise', async () => {
  const seen: ExtensionModelProviderProps[] = [];
  const AcmeForm = (props: ExtensionModelProviderProps) => { seen.push(props); return <p>Acme plugin form</p>; };
  const extension: UiExtension = { id: 'acme', apiVersion: 1, modelProviders: [{ provider: 'acme', component: AcmeForm }] };
  pluginUi.current = { registry: createExtensionRegistry([extension], { acme: { modelProviders: ['acme'] } }), applications: {}, errors: {}, loaded: true };
  mockApi([], [custom, acme]);
  render(<ModelsPanel context={context} />);
  await screen.findByRole('form', { name: 'New Custom connection' });
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'acme' } });
  expect(await screen.findByText('Acme plugin form')).toBeVisible();
  expect(seen.at(-1)?.provider.id).toBe('acme');
  pluginUi.current = { registry: createExtensionRegistry([extension], {}), applications: {}, errors: {}, loaded: true };
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'acme' } });
  expect(await screen.findByRole('form', { name: 'New Acme connection' })).toBeVisible();
});

it('reports owner-only access', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Only owners can manage model connections' }, 403)));
  render(<ModelsPanel context={context} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Только владелец');
});
