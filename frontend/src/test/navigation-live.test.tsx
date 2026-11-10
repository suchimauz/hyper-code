import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNavigation } from '../hooks/useNavigation';
import { getNavigation, getProfile } from '../lib/navigation';
vi.mock('../lib/navigation', async original => ({ ...await original<typeof import('../lib/navigation')>(), getNavigation: vi.fn(), getProfile: vi.fn() }));
let subscriptions: Array<Parameters<NonNullable<Window['mauzCodeLive']>['subscribe']>[0]>;
const data = (running = false, unread = true) => ({ projects: [{ id: 'p', title: 'P', dir: '/p', host: null, unreadCount: Number(unread), chats: [{ id: 'a', title: 'A', model: '', runState: running ? 'running' : 'idle', hasUnread: unread, lastReplyAt: 100 }] }] });
beforeEach(() => {
  vi.useFakeTimers(); subscriptions = []; vi.mocked(getNavigation).mockResolvedValue(data()); vi.mocked(getProfile).mockResolvedValue({ authenticated: true, canManage: false, user: null });
  window.mauzcodeLive = { getStatus: () => 'connected', subscribe: s => { subscriptions.push(s); return () => {}; } };
});
afterEach(() => { delete window.mauzcodeLive; vi.useRealTimers(); vi.clearAllMocks(); });
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
it.each([true, false])('uses explicit server capability %s without a user identity', async canManage => {
  vi.mocked(getProfile).mockResolvedValue({ authenticated: false, user: null, canManage });
  const view = renderHook(() => useNavigation());
  expect(view.result.current.canManage).toBe(false); await tick();
  expect(view.result.current.canManage).toBe(canManage);
});
it('does not infer owner capability when the explicit capability is missing', async () => {
  vi.mocked(getProfile).mockResolvedValue({ authenticated: true, user: {name: 'Owner', role: 'owner'} } as Awaited<ReturnType<typeof getProfile>>);
  const view = renderHook(() => useNavigation()); await tick();
  expect(view.result.current.canManage).toBe(false);
});
it('fails closed on profile failure', async () => {
  vi.mocked(getProfile).mockRejectedValue(new Error('Unauthorized'));
  const view = renderHook(() => useNavigation()); await tick();
  expect(view.result.current.canManage).toBe(false);
  expect(view.result.current.profileError).toBe('Unauthorized');
});
it('updates running status from the agents topic without a 15-second wait or profile refetch', async () => {
  const view = renderHook(() => useNavigation()); await tick(); expect(view.result.current.projects[0].chats[0].runState).toBe('idle');
  vi.mocked(getNavigation).mockResolvedValue(data(true));
  act(() => subscriptions.forEach(s => { s.onEvent({ type: 'agents.changed', topic: 'agents', agentId: 'a' }); s.onEvent({ type: 'refresh', topic: 'agents' }); }));
  await tick(250); expect(view.result.current.projects[0].chats[0].runState).toBe('running'); expect(getNavigation).toHaveBeenCalledTimes(2); expect(getProfile).toHaveBeenCalledTimes(1);
  await tick(15000); expect(getNavigation).toHaveBeenCalledTimes(2);
});
it('clears acknowledged unread state immediately and ignores a pre-receipt stale response', async () => {
  const view = renderHook(() => useNavigation()); await tick();
  let resolve!: (value: ReturnType<typeof data>) => void;
  vi.mocked(getNavigation).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  act(() => view.result.current.refresh()); await tick(250);
  act(() => window.dispatchEvent(new CustomEvent('mauzcode-ui:read', { detail: { id: 'a', seenAt: 100 } })));
  expect(view.result.current.projects[0].chats[0].hasUnread).toBe(false); expect(view.result.current.projects[0].unreadCount).toBe(0);
  await act(async () => resolve(data())); expect(view.result.current.projects[0].chats[0].hasUnread).toBe(false);
  vi.mocked(getNavigation).mockResolvedValue(data(false, false)); await tick(250); expect(view.result.current.projects[0].chats[0].hasUnread).toBe(false);
});
