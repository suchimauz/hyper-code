import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PluginsPage } from '../components/hyper/PluginsPage';
vi.mock('../components/hyper/PluginUiReview', () => ({ PluginUiReview: () => null }));
import { groupPlugins, phosphorClass, type InstalledPlugin } from '../lib/plugins';

const plugin = (over: Partial<InstalledPlugin>): InstalledPlugin => ({ name: 'p', label: 'P', description: 'd', icon: 'ph-browser', version: null, source: 'official', namespaces: ['p'], functions: 2, routes: 0, hasSkill: true, configurable: false, ...over });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('Plugins page', () => {
  it('groups by real source layer and filters text', () => {
    const list = [plugin({ name: 'browser', label: 'Browser' }), plugin({ name: 'redmine', label: 'Redmine', source: 'user' })];
    expect(groupPlugins(list).map(g => g.title)).toEqual(['Official plugins', 'Installed plugins']);
    expect(groupPlugins(list, 'red').map(g => g.plugins[0]!.name)).toEqual(['redmine']);
    expect(phosphorClass('ph-x"><script')).toBeNull();
  });

  it('lists plugins and reloads one through the CSRF bridge', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ plugins: [plugin({ name: 'browser', label: 'Browser' })], csrfToken: 'tok' })).mockResolvedValue(json({ ok: true, plugins: [plugin({ name: 'browser', label: 'Browser' })], csrfToken: 'tok' }));
    render(<PluginsPage />);
    expect(await screen.findByRole('button', { name: 'Browser' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Browser' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const [, init] = fetchMock.mock.calls[1]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'reload', name: 'browser' });
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('tok');
  });

  it('opens an in-app plugin card instead of linking to Hyper', async () => {
    const detail = { name: 'browser', label: 'Browser', description: 'd', source: 'official', namespaces: ['browser'], routes: 0, domains: [], overview: '---\nname: browser\n---\n# Browser guide', overviewTruncated: false, functions: [{ name: 'browser.open', summary: 'Open a tab', signature: '() => void', returnType: 'void' }], settings: [], secrets: [] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ plugins: [plugin({ name: 'browser', label: 'Browser' })], csrfToken: 'tok' })).mockResolvedValue(json({ plugin: detail }));
    const { container } = render(<PluginsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Browser' }));
    expect(await screen.findByText('Browser guide')).toBeTruthy();
    expect(String(fetchMock.mock.calls[1]![0])).toContain('?plugin=browser');
    expect(container.querySelector('a[href^="/plugins"]')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Functions/ }));
    expect(screen.getByText('browser.open')).toBeTruthy();
  });
});

it('shows offline source provenance and opens only a CSRF protected rollback review', async () => {
  const selection = { provider: 'mock', name: 'demo', revision: 'previous', source: { repo: 'local' } };
  const onOpenAgent = vi.fn();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') return json({ ok: true, agentId: 'review' });
    if (String(url).includes('sources=1')) return json({ sources: [{ name: 'demo', managed: true, modified: false, status: 'managed', mounted: false, previousSelection: selection }], providers: [{ id: 'mock', label: 'Mock source', description: 'Local', configurationHref: '/source/config' }], errors: [] });
    return json({ plugins: [], csrfToken: 'tok' });
  });
  render(<PluginsPage onOpenAgent={onOpenAgent} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Sources' }));
  expect(await screen.findByText(/managed · Not mounted/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Configure source' }).getAttribute('href')).toBe('/source/config');
  fireEvent.click(screen.getByRole('button', { name: 'Review rollback' }));
  await waitFor(() => expect(onOpenAgent).toHaveBeenCalledWith('review'));
  const call = fetchMock.mock.calls.find(([,init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ action: 'review', selection, operation: 'rollback' });
  expect(new Headers(call[1]?.headers).get('X-CSRF-Token')).toBe('tok');
});
