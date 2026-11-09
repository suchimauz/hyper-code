import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SecureInputDialog } from './SecureInputDialog';

const fixture = 'fixture-only-value';
const prompt = () => ({ id: 'fixture', title: 'Fixture prompt', name: 'Fixture value', message: 'Fixture explanation', kind: 'password', maxlength: 64, expiresAt: Date.now() + 10000 });
let current: ReturnType<typeof prompt> | null;
let status: number;
let csrf: string;
let postStatus: number;
let fetcher: ReturnType<typeof vi.fn>;
const response = (data: object, code = 200) => ({ ok: code >= 200 && code < 300, status: code, json: vi.fn(async () => data), text: vi.fn(async () => fixture) });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function open() { const view = render(<SecureInputDialog />); await flush(); return view; }
function field() { return screen.getByLabelText('Fixture value') as HTMLInputElement; }
function posts() { return fetcher.mock.calls.filter(([url]) => url === '/secureInput/submit'); }
beforeEach(() => {
  vi.useFakeTimers(); current = prompt(); status = 200; csrf = 'exact-fixture-csrf'; postStatus = 200;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open'); } });
  fetcher = vi.fn(async (url: string) => url === '/secureInput/current' ? response({ prompt: current, csrfToken: csrf }, status) : response({ error: fixture }, postStatus));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test('loads metadata only; typing, blur and polling do not submit or serialize the value', async () => {
  const view = await open();
  expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe('secure-input-description');
  expect(field().type).toBe('password'); expect(field().maxLength).toBe(64);
  fireEvent.change(field(), { target: { value: fixture } }); fireEvent.blur(field());
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(posts()).toHaveLength(0); expect(field().value).toBe(fixture);
  expect(view.container.innerHTML).not.toContain(fixture);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store' });
});
test('Continue alone posts exact CSRF and value, then wipes detached DOM', async () => {
  await open(); const node = field(); fireEvent.change(node, { target: { value: fixture } });
  fireEvent.click(screen.getByText('Continue')); await flush();
  expect(posts()).toHaveLength(1);
  expect(posts()[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ id: 'fixture', value: fixture }) });
  expect(node.value).toBe(''); expect(screen.queryByRole('dialog')).toBeNull();
});
test.each(['button', 'escape'])('explicit cancel via %s omits the value', async method => {
  await open(); const node = field(); node.value = fixture;
  if (method === 'button') fireEvent.click(screen.getByText('Cancel')); else fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await flush(); expect(JSON.parse(posts()[0][1].body)).toEqual({ id: 'fixture', cancel: true }); expect(node.value).toBe('');
});
test.each([401, 403])('metadata auth rejection %s clears value and token without posting', async code => {
  await open(); const node = field(); node.value = fixture; status = code;
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(node.value).toBe(''); expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(0);
});
test('null metadata and rotated CSRF wipe existing input', async () => {
  await open(); const node = field(); node.value = fixture; csrf = 'new-session';
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(field().value).toBe(''); field().value = fixture; current = null;
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(node.value).toBe(''); expect(screen.queryByRole('dialog')).toBeNull();
});
test('expiry clears input and expired metadata never reopens it', async () => {
  current = { ...prompt(), expiresAt: Date.now() + 100 }; await open(); const node = field(); node.value = fixture;
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  expect(node.value).toBe(''); expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(0);
});
test('unmount wipes retained DOM, aborts transport, and stops polling', async () => {
  const view = await open(); const node = field(); node.value = fixture;
  const signal = fetcher.mock.calls[0][1].signal; view.unmount();
  expect(node.value).toBe(''); expect(signal.aborted).toBe(true);
  const count = fetcher.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(fetcher).toHaveBeenCalledTimes(count);
});
test('response text and thrown errors never appear in errors or logs', async () => {
  const log = vi.spyOn(console, 'log'); const error = vi.spyOn(console, 'error');
  const view = await open(); field().value = fixture; postStatus = 500;
  fireEvent.click(screen.getByText('Continue')); await flush();
  expect(screen.getByRole('alert').textContent).not.toContain(fixture);
  fetcher.mockRejectedValueOnce(new Error(fixture)); fireEvent.click(screen.getByText('Continue')); await flush();
  expect(screen.getByRole('alert').textContent).toBe('Connection unavailable. Please try again.');
  expect(view.container.innerHTML).not.toContain(fixture); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
test.each([401, 403])('submission auth rejection %s clears the value', async code => {
  await open(); const node = field(); node.value = fixture; postStatus = code;
  fireEvent.click(screen.getByText('Continue')); await flush(); expect(node.value).toBe(''); expect(screen.queryByRole('dialog')).toBeNull();
});

test('in-flight submit aborts on expiry; late sensitive error cannot affect the next prompt', async () => {
  current = { ...prompt(), expiresAt: Date.now() + 100 }; await open(); const node = field(); node.value = fixture;
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByText('Continue'));
  const signal = posts()[0][1].signal;
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(signal.aborted).toBe(true); expect(node.value).toBe('');
  current = { ...prompt(), id: 'next' };
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  await act(async () => { resolve(response({ error: fixture }, 500)); });
  expect(screen.queryByRole('alert')).toBeNull(); expect(field().value).toBe('');
});
test('late metadata after unmount never opens a dialog', async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<SecureInputDialog />); view.unmount();
  await act(async () => { resolve(response({ prompt: current, csrfToken: csrf })); });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(posts()).toHaveLength(0);
});
