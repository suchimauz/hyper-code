import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQuotas } from '../hooks/useQuotas';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const body = { updatedAt: 1, accounts: [{ id: 'codex:a', provider: 'codex', account: 'a', label: 'a', model: 'codex/a:', connection: 'local', kind: 'quota', windows: {}, tone: 'neutral', parkedAgents: 0 }] };

it('reads /api/v1/quotas immediately and polls every 60 s', async () => {
  vi.useFakeTimers();
  const icon = { src: 'data:image/svg+xml,%3Csvg%2F%3E', custom: false };
  const all = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('provider-icons') ? { icons: { codex: icon } } : body), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', all);
  const fetchMock = { get mock() { return { calls: all.mock.calls.filter(c => String(c[0]) === '/api/v1/quotas') }; } };
  const { result, unmount } = renderHook(() => useQuotas());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/v1/quotas');
  expect(result.current.accounts?.map(a => a.id)).toEqual(['codex:a']);
  expect(result.current.accounts?.[0].icon).toEqual(icon);
  expect(all.mock.calls.filter(c => String(c[0]) === '/ui-lab-api/provider-icons')).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
  expect(fetchMock.mock.calls).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
});

it('keeps the last snapshot when a later read fails', async () => {
  vi.useFakeTimers();
  let n = 0;
  const all = vi.fn(async (url: string) => url.includes('provider-icons')
    ? new Response(JSON.stringify({ icons: {} }), { headers: { 'Content-Type': 'application/json' } })
    : n++ === 0 ? new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'down' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', all);
  const fetchMock = { get mock() { return { calls: all.mock.calls.filter(c => String(c[0]) === '/api/v1/quotas') }; } };
  const { result } = renderHook(() => useQuotas());
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
  expect(result.current.accounts).toHaveLength(1);
  expect(result.current.error).toBe('down');
});
