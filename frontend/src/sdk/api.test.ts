import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson, safeApiPath } from './api';
afterEach(() => { vi.unstubAllGlobals(); document.head.querySelector('meta[name="csrf-token"]')?.remove(); });
describe('same-origin SDK API', () => {
  it.each(['https://evil.test/x', '//evil.test/x', '/\\evil.test', '/a/../x', '/%2e%2e/x', '/%2f%2fevil.test', '/a%5cb', '/%252e%252e/x', '/x#fragment', '/x\n', '/%zz'])('rejects unsafe path %s', path => {
    expect(() => safeApiPath(path)).toThrow();
  });
  it('allows encoded ids and query parameters', () => expect(safeApiPath('/api/a%20b?next=https%3A%2F%2Fx')).toBe('/api/a%20b?next=https%3A%2F%2Fx'));
  it('uses same-origin credentials, JSON headers, signal, and explicit CSRF', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}')); vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await requestJson('/api/write', { method: 'POST', body: { value: 1 }, csrfToken: 'cookie-bound', signal })).toEqual({ ok: true });
    const options = fetcher.mock.calls[0][1];
    expect(options).toMatchObject({ credentials: 'same-origin', mode: 'same-origin', redirect: 'error', signal, body: '{"value":1}' });
    expect(options.headers.get('X-CSRF-Token')).toBe('cookie-bound');
    expect(options.headers.get('Accept')).toBe('application/json');
    expect(options.headers.has('Origin')).toBe(false);
  });
  it('fails writes without CSRF before fetch and preserves meta/header tokens', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 204 }))); vi.stubGlobal('fetch', fetcher);
    await expect(requestJson('/write', { method: 'POST' })).rejects.toMatchObject({ status: 403 }); expect(fetcher).not.toHaveBeenCalled();
    document.head.insertAdjacentHTML('beforeend', '<meta name="csrf-token" content="meta-token">');
    await requestJson('/write', { method: 'POST' }); expect(fetcher.mock.calls[0][1].headers.get('X-CSRF-Token')).toBe('meta-token');
    await requestJson('/write', { method: 'POST', headers: { 'X-CSRF-Token': 'header-token' } }); expect(fetcher.mock.calls[1][1].headers.get('X-CSRF-Token')).toBe('header-token');
  });
  it.each([401, 403])('exposes auth status %s without retry', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"denied"}', { status })); vi.stubGlobal('fetch', fetcher);
    const error = await requestJson('/api').catch(e => e);
    if (!(error instanceof ApiError)) throw new Error('Expected ApiError');
    expect(error).toBeInstanceOf(ApiError); expect(error.status).toBe(status); expect(error.authRequired).toBe(status === 401); expect(error.forbidden).toBe(status === 403); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects successful HTML instead of pretending it is JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>login</html>')));
    await expect(requestJson('/api')).rejects.toThrow('Expected a JSON response');
  });
});
