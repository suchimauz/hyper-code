import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { liveRefresh } from '../lib/liveRefresh';
import type { LiveEvent, LiveStatus } from '../lib/live';
let subscriptions: Array<Parameters<NonNullable<Window['mauzCodeLive']>['subscribe']>[0]>;
let statuses: Array<(status: LiveStatus) => void>;
let status: LiveStatus;
let hidden = false;
const disposers: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers(); subscriptions = []; statuses = []; status = 'connected'; hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  window.mauzcodeLive = { getStatus: () => status,
    subscribe: opts => { subscriptions.push(opts); return () => { subscriptions = subscriptions.filter(s => s !== opts); }; },
    onStatus: listener => { statuses.push(listener); return () => { statuses = statuses.filter(s => s !== listener); }; },
  };
});
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); delete window.mauzcodeLive; vi.useRealTimers(); vi.restoreAllMocks(); });
const emit = (event: LiveEvent = { topic: 'agent:a', type: 'refresh' }) => subscriptions.forEach(s => s.onEvent(event));
const change = (next: LiveStatus) => { status = next; statuses.forEach(s => s(next)); };
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
function start(read = vi.fn(async (_signal: AbortSignal) => {})) {
  const live = liveRefresh({ name: 'test', matches: e => e.topic === 'agent:a', read }); disposers.push(live.dispose); return { ...live, read };
}
it('does no frequent reads with healthy SSE; reconciles once a minute', async () => {
  const { read } = start(); await tick(); expect(read).toHaveBeenCalledTimes(1);
  await tick(59000); expect(read).toHaveBeenCalledTimes(1);
  await tick(1000); expect(read).toHaveBeenCalledTimes(2);
});
it('coalesces bursts, filters unrelated events and never starves under a token stream', async () => {
  const { read } = start(); await tick();
  emit({ topic: 'agent:b' }); await tick(300); expect(read).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 20; i++) emit();
  await tick(100); expect(read).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 20; i++) { emit(); await tick(50); }
  expect(read.mock.calls.length).toBeGreaterThan(2); expect(read.mock.calls.length).toBeLessThan(8);
});
it('serializes slow reads and remembers one trailing invalidation', async () => {
  let resolve!: () => void;
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>(r => { resolve = r; })); start(read); await tick();
  for (let i = 0; i < 20; i++) emit(); await tick(1000); expect(read).toHaveBeenCalledTimes(1);
  resolve(); await tick(100); expect(read).toHaveBeenCalledTimes(2);
  resolve(); await tick(1000); expect(read).toHaveBeenCalledTimes(2);
});
it('uses temporary fallback after loss and promptly reconciles on reconnect', async () => {
  const { read } = start(); await tick(); change('disconnected');
  await tick(2500); expect(read).toHaveBeenCalledTimes(2);
  change('connected'); subscriptions.forEach(s => s.resync('reconnect'));
  await tick(250); expect(read).toHaveBeenCalledTimes(3);
  await tick(10000); expect(read).toHaveBeenCalledTimes(3);
});
it('does not fetch hidden tabs, resumes pending refresh and cleans up', async () => {
  const { read, dispose } = start(); await tick(); emit();
  hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  await tick(120000); expect(read).toHaveBeenCalledTimes(1);
  hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  await tick(100); expect(read).toHaveBeenCalledTimes(2);
  dispose(); expect(subscriptions).toHaveLength(0); expect(statuses).toHaveLength(0);
  expect(read.mock.calls[0][0].aborted).toBe(true); await tick(120000); expect(read).toHaveBeenCalledTimes(2);
});
