import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApplicationPages, applicationLinks } from '../components/hyper/ApplicationPages';
const live = vi.hoisted(() => ({ options: null as any, stop: vi.fn() }));
vi.mock('../sdk/live', () => ({ subscribeLive: (options: unknown) => { live.options = options; return live.stop; } }));
afterEach(() => { vi.restoreAllMocks(); live.stop.mockClear(); });
const item = (href: string) => ({ id: href, label: href, href });
describe('declared application documents', () => {
  it('rejects arbitrary origins, unsafe paths, native shell and disabled banking surfaces', () => {
    expect(applicationLinks({ items: ['/news', '/files', '//evil.test', '/%2f%2fevil.test', '/a/../b', '/%0aevil', '/', '/auth/users', '/sber/login', '/tbank', 'https://example.com'].map(item) }).map(x => x.href)).toEqual(['/news', '/files']);
    expect(applicationLinks(null)).toEqual([]);
  });
  it('loads only declared pages, hosts the chosen document and disposes live subscription', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'news', label: 'Новости', href: '/news', group: 'Приложения' }] })));
    const view = render(<ApplicationPages theme="light" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Новости Приложения' }));
    expect(view.container.querySelector('iframe')?.getAttribute('src')).toBe('/news');
    expect(view.container.querySelector('iframe')?.title).toBe('Новости');
    expect(fetch.mock.calls[0]?.[0]).toBe('/nav/items');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Accept')).toBe('application/json');
    expect(view.container.querySelector('[data-live-topic="plugins"]')).not.toBeNull();
    expect(typeof live.options.resync).toBe('function');
    expect(typeof live.options.onError).toBe('function');
    fireEvent.click(screen.getByRole('button', { name: 'Все приложения' }));
    expect(view.container.querySelector('iframe')).toBeNull();
    view.unmount(); expect(live.stop).toHaveBeenCalled();
  });
  it('displays read errors without retrying writes or invoking approvals', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 }));
    render(<ApplicationPages theme="dark" />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Permission denied'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET');
  });
});
