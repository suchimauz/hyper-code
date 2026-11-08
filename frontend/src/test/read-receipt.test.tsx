import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReadReceipt } from '../hooks/useReadReceipt';
import { markChatRead, type EventPage } from '../lib/hyper';
vi.mock('../lib/hyper', async importOriginal => ({ ...await importOriginal<typeof import('../lib/hyper')>(), markChatRead: vi.fn() }));
const page = (id: string, ts = 100) => ({ agentId: id, events: [{ idx: 1, ts, type: 'assistant', text: 'hello' }] }) as EventPage;
let hidden = false;
beforeEach(() => { vi.useFakeTimers(); hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden); vi.mocked(markChatRead).mockResolvedValue({ ok: true, seenAt: 100 }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const tick = (ms = 100) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
it('marks the loaded snapshot once, ignores token-only updates and acknowledges new events', async () => {
  const view = renderHook(({ p }) => useReadReceipt('a', p), { initialProps: { p: page('a') } }); await tick();
  expect(markChatRead).toHaveBeenCalledTimes(1); expect(markChatRead).toHaveBeenCalledWith('a', 100, expect.any(AbortSignal));
  view.rerender({ p: { ...page('a'), partial: { text: 'stream', revision: 2, startedAt: 1 } } }); await tick(); expect(markChatRead).toHaveBeenCalledTimes(1);
  view.rerender({ p: page('a', 200) }); await tick(); expect(markChatRead).toHaveBeenCalledTimes(2);
});
it('acknowledges a tool-only initial tail but does not POST for each subsequent tool', async () => {
  const tools = (ts: number) => ({ ...page('a', ts), events: [{ idx: 90, ts, type: 'tool', text: null }] });
  const view = renderHook(({ p }) => useReadReceipt('a', p), { initialProps: { p: tools(100) } }); await tick();
  expect(markChatRead).toHaveBeenCalledTimes(1);
  view.rerender({ p: tools(200) }); await tick(); expect(markChatRead).toHaveBeenCalledTimes(1);
});
it('does not mark hidden or mismatched chats and resumes when visible', async () => {
  hidden = true; const view = renderHook(({ id, p }) => useReadReceipt(id, p), { initialProps: { id: 'a', p: page('a') } }); await tick(); expect(markChatRead).not.toHaveBeenCalled();
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange'))); await tick(); expect(markChatRead).toHaveBeenCalledTimes(1);
  view.rerender({ id: 'b', p: page('a') }); await tick(); expect(markChatRead).toHaveBeenCalledTimes(1);
});
it('never clears a badge on failure; retries and emits acknowledgement only on success', async () => {
  vi.mocked(markChatRead).mockRejectedValueOnce(new Error('offline'));
  const listener = vi.fn(); window.addEventListener('hyper-ui:read', listener);
  const view = renderHook(() => useReadReceipt('a', page('a'))); await tick(); expect(listener).not.toHaveBeenCalled();
  await tick(5000); expect(listener).toHaveBeenCalledTimes(1);
  view.unmount(); window.removeEventListener('hyper-ui:read', listener);
});
it('aborts receipt when switching chats and ignores a stale completion', async () => {
  let resolve!: (value: { ok: boolean; seenAt: number }) => void;
  vi.mocked(markChatRead).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const listener = vi.fn(); window.addEventListener('hyper-ui:read', listener);
  const view = renderHook(({ id }) => useReadReceipt(id, page(id)), { initialProps: { id: 'a' } }); await tick();
  const signal = vi.mocked(markChatRead).mock.calls[0][2]!;
  view.rerender({ id: 'b' }); expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ok: true, seenAt: 100 })); expect(listener).not.toHaveBeenCalled();
  view.unmount(); window.removeEventListener('hyper-ui:read', listener);
});
