import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvas } from './useCanvas';

const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const state = (open: boolean, rev: string) => ({ agentId: 'a', open, activeItemId: 7, rev });
const pending = () => new Promise<Response>(() => {});
afterEach(() => vi.unstubAllGlobals());

describe('useCanvas error and toggle races', () => {
  it.each([
    [() => new Response('Forbidden', { status: 403 }), 'Canvas: HTTP 403'],
    [() => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }), 'Сессия Canvas недоступна'],
  ])('rejects non-state responses instead of opening Canvas (%#)', async (response, message) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockImplementation(pending);
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() => useCanvas('a'));
    await waitFor(() => expect(result.current.error).toContain(message));
    expect(result.current.view).toBeNull(); expect(result.current.open).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('ignores an older toggle response after a newer toggle has won', async () => {
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>(resolve => { resolveOld = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce(json(state(false, '1'))).mockImplementation(pending);
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() => useCanvas('a'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fetcher.mockReturnValueOnce(old);
    let first!: Promise<void>;
    act(() => { first = result.current.setOpen(true); });
    const oldSignal = fetcher.mock.calls.at(-1)![1].signal;
    fetcher.mockResolvedValueOnce(json(state(false, '3'))).mockResolvedValueOnce(json(state(false, '3')));
    await act(async () => { await result.current.setOpen(false); });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { resolveOld(json(state(true, '2'))); await first; });
    expect(result.current.open).toBe(false); expect(result.current.rev).toBe('3');
    expect(result.current.error).toBeNull();
  });
});
