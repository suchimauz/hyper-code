import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvas } from './useCanvas';

const state = (agentId = 'a', open = false, rev = '1') => ({ agentId, open, activeItemId: open ? 7 : null, rev });
const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const pending = () => new Promise<Response>(() => {});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('useCanvas', () => {
  it('loads real state and auto-opens after a watch change', async () => {
    const watch = deferred<Response>();
    const fetch = vi.fn().mockResolvedValueOnce(json(state())).mockReturnValueOnce(watch.promise).mockResolvedValueOnce(json(state('a', true, '2'))).mockImplementation(pending);
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCanvas('a'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => { watch.resolve(json({ changed: true, rev: '2' })); });
    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.activeItemId).toBe(7); expect(result.current.rev).toBe('2');
    expect(fetch.mock.calls[1][0]).toBe('/canvas/a/watch?rev=1');
  });

  it('aborts old agent requests and ignores responses even if fetch ignores abort', async () => {
    const old = deferred<Response>();
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(json(state('b', true))).mockImplementation(pending);
    vi.stubGlobal('fetch', fetch);
    const { result, rerender, unmount } = renderHook(({ id }) => useCanvas(id), { initialProps: { id: 'a' } });
    const oldSignal = fetch.mock.calls[0][1].signal;
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.view?.agentId).toBe('b'));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { old.resolve(json(state('a'))); });
    expect(result.current.view?.agentId).toBe('b');
    const signal = fetch.mock.calls.at(-1)![1].signal;
    unmount(); expect(signal.aborted).toBe(true);
  });

  it('posts only open, aborts watch, and resumes state sync', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(state())).mockImplementation(pending);
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCanvas('a'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const watchSignal = fetch.mock.calls[1][1].signal;
    fetch.mockResolvedValueOnce(json(state('a', true, '2'))).mockResolvedValueOnce(json(state('a', true, '2')));
    await act(async () => { await result.current.setOpen(true); });
    expect(watchSignal.aborted).toBe(true);
    const post = fetch.mock.calls.find(call => call[1].method === 'POST')!;
    expect(post[0]).toBe('/canvas/a'); expect(JSON.parse(post[1].body)).toEqual({ open: true });
    expect(result.current.open).toBe(true);
  });

  it('exposes errors, retries, and allows explicit refresh', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(pending);
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCanvas('a'));
    await waitFor(() => expect(result.current.error).toBe('offline'));
    fetch.mockResolvedValueOnce(json(state()));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.view?.agentId).toBe('a'));
    expect(result.current.error).toBeNull();
  });

  it('retries failed state after delay and cancels retry on unmount', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
    const { unmount } = renderHook(() => useCanvas('a'));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight toggle on unmount and makes no calls without an agent', async () => {
    const fetch = vi.fn().mockImplementation(pending); vi.stubGlobal('fetch', fetch);
    const { result, rerender, unmount } = renderHook(({ id }: { id: string | null }) => useCanvas(id), { initialProps: { id: null as string | null } });
    expect(fetch).not.toHaveBeenCalled(); rerender({ id: 'a' });
    act(() => { void result.current.setOpen(true); });
    const signal = fetch.mock.calls.at(-1)![1].signal;
    unmount(); expect(signal.aborted).toBe(true);
  });
  it('follows canvas.changed on the shared live stream without holding a /watch request', async () => {
    let handler: ((event: object) => void) | undefined;
    const unsubscribe = vi.fn();
    window.hyperLive = { subscribe: vi.fn(options => { handler = options.onEvent as (event: object) => void; return unsubscribe; }) };
    try {
      const fetch = vi.fn().mockResolvedValue(json(state())); vi.stubGlobal('fetch', fetch);
      const { result, unmount } = renderHook(() => useCanvas('a'));
      await waitFor(() => expect(result.current.view?.agentId).toBe('a'));
      expect(fetch.mock.calls.every(call => !String(call[0]).includes('/watch'))).toBe(true);
      act(() => { handler!({ type: 'canvas.changed', agentId: 'b', open: true, activeItemId: 1, rev: '9' }); });
      expect(result.current.open).toBe(false);
      act(() => { handler!({ type: 'canvas.changed', agentId: 'a', open: true, activeItemId: 7, rev: '2' }); });
      expect(result.current.open).toBe(true); expect(result.current.rev).toBe('2');
      unmount(); expect(unsubscribe).toHaveBeenCalled();
    } finally { delete window.hyperLive; }
  });
});
