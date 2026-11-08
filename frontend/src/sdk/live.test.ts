import { afterEach, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { loadLiveClient } from '../lib/live';
import { subscribeLive, useLiveSubscription } from './live';
vi.mock('../lib/live', () => ({ loadLiveClient: vi.fn() }));
afterEach(() => { delete window.hyperLive; vi.resetAllMocks(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
it('does not subscribe after cleanup during asynchronous loading', async () => {
  let loaded!: () => void; vi.mocked(loadLiveClient).mockReturnValue(new Promise(resolve => { loaded = resolve; }));
  const subscribe = vi.fn(); window.hyperLive = { subscribe };
  const stop = subscribeLive({ name: 'test', onEvent: vi.fn(), resync: vi.fn(), onError: vi.fn() });
  stop(); stop(); loaded(); await flush(); expect(subscribe).not.toHaveBeenCalled();
});
it('forwards events and resync and unsubscribes exactly once', async () => {
  vi.mocked(loadLiveClient).mockResolvedValue(); const cleanup = vi.fn(); const subscribe = vi.fn().mockReturnValue(cleanup); window.hyperLive = { subscribe };
  const onEvent = vi.fn(), resync = vi.fn(); const stop = subscribeLive({ name: 'example', types: ['changed'], onEvent, resync, onError: vi.fn() });
  await flush(); const callbacks = subscribe.mock.calls[0][0];
  callbacks.onEvent({ type: 'changed' }); callbacks.resync('reconnect'); expect(onEvent).toHaveBeenCalledWith({ type: 'changed' }); expect(resync).toHaveBeenCalledWith('reconnect');
  stop(); stop(); callbacks.resync('late'); callbacks.onEvent({ type: 'late' }); expect(cleanup).toHaveBeenCalledTimes(1); expect(onEvent).toHaveBeenCalledTimes(1); expect(resync).toHaveBeenCalledTimes(1);
});
it('reports load errors but not after disposal', async () => {
  vi.mocked(loadLiveClient).mockRejectedValue(new Error('offline')); const onError = vi.fn();
  subscribeLive({ name: 'x', onEvent: vi.fn(), resync: vi.fn(), onError }); await flush(); expect(onError).toHaveBeenCalledTimes(1);
  const stop = subscribeLive({ name: 'y', onEvent: vi.fn(), resync: vi.fn(), onError }); stop(); await flush(); expect(onError).toHaveBeenCalledTimes(1);
});
it('hook cleans up on unmount and uses fresh callbacks without resubscribing', async () => {
  vi.mocked(loadLiveClient).mockResolvedValue(); const cleanup = vi.fn(); const subscribe = vi.fn().mockReturnValue(cleanup); window.hyperLive = { subscribe };
  const first = vi.fn(), second = vi.fn(); const { rerender, unmount } = renderHook(({ onEvent }) => useLiveSubscription({ name: 'hook', types: ['changed'], onEvent, resync: vi.fn(), onError: vi.fn() }), { initialProps: { onEvent: first } });
  await flush(); rerender({ onEvent: second }); subscribe.mock.calls[0][0].onEvent({}); expect(second).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled(); expect(subscribe).toHaveBeenCalledTimes(1); unmount(); expect(cleanup).toHaveBeenCalledTimes(1);
});
