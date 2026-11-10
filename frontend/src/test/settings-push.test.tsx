import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PushSettingsPanel } from '../components/settings/PushSettingsPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
function setup(existing = false, permission: 'denied' | 'granted' = 'denied') {
  const unsubscribe = vi.fn(async () => true);
  const requestPermission = vi.fn(async () => permission);
  const created = { endpoint: 'https://example.test/created', toJSON: () => ({ endpoint: 'https://example.test/created', keys: { p256dh: 'k', auth: 'a' } }), unsubscribe };
  const subscribe = vi.fn(async () => created);
  const register = vi.fn(async () => ({ pushManager: { getSubscription: async () => null, subscribe } }));
  const sub = { endpoint: 'https://example.test/endpoint', unsubscribe };
  const getRegistration = vi.fn(async () => ({ active: { scriptURL: 'https://mauzcode.test/webPush/web-push-sw.js' }, pushManager: { getSubscription: async () => existing ? sub : null } }));
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration, register } });
  const config = { enabled: true, publicKey: 'key', userId: 'owner', binding: 'session', devices: [{ id: 's1', endpointHash: '251c109df34e0bfa56225730ab3a62f0ae5540f26d101ab85948a34c59476fcb', createdAt: 1700000000000, expiresAt: 1900000000000, provider: 'apple', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', current: true }, { id: 's2', endpointHash: 'b'.repeat(64), createdAt: 1710000000000, expiresAt: 1900000000000, provider: 'google', userAgent: null, current: false }], csrf: 'token' };
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(config), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return { unsubscribe, requestPermission, register, subscribe, fetchMock };
}
test('opening settings reads only; permission prompt requires button gesture', async () => {
  const h = setup(); render(<PushSettingsPanel />);
  await screen.findByText('iPhone · Safari');
  expect(h.requestPermission).not.toHaveBeenCalled(); expect(h.register).not.toHaveBeenCalled(); expect(h.unsubscribe).not.toHaveBeenCalled();
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Enable on this device' }));
  expect(h.requestPermission).toHaveBeenCalledTimes(1);
  await screen.findByText(/Notifications are blocked/); expect(h.register).not.toHaveBeenCalled();
});
test('unsubscribe requires explicit confirmation, then uses scoped CSRF transport', async () => {
  const h = setup(true); localStorage.setItem('mauzcode-push-binding', 'owner:session'); render(<PushSettingsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Disable on this device' }));
  expect(h.unsubscribe).not.toHaveBeenCalled(); expect(h.fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));
  await waitFor(() => expect(h.unsubscribe).toHaveBeenCalledTimes(1));
  expect(h.fetchMock.mock.calls[1]).toMatchObject(['/webPush/unsubscribe', { method: 'POST', headers: { 'X-CSRF-Token': 'token' } }]);
});
test('connected devices render named and fallback rows without per-agent toggles', async () => {
  const h = setup(); render(<PushSettingsPanel />);
  expect(await screen.findByText('iPhone · Safari')).toBeTruthy();
  expect(screen.getByText('Google push (FCM)')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});
test('removing another device requires confirmation and posts owner-scoped id', async () => {
  const h = setup(true); localStorage.setItem('mauzcode-push-binding', 'owner:session'); render(<PushSettingsPanel />);
  const own = (await screen.findByText('This device')).closest('li')!;
  expect(within(own).queryByRole('button')).toBeNull();
  const row = screen.getByText('Google push (FCM)').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
  fireEvent.click(within(row).getByRole('button', { name: 'Confirm remove' }));
  await waitFor(() => expect(h.fetchMock.mock.calls.some(c => c[0] === '/webPush/unsubscribe')).toBe(true));
  const call = h.fetchMock.mock.calls.find(c => c[0] === '/webPush/unsubscribe') as unknown as [string, RequestInit];
  expect(JSON.parse(String(call[1].body))).toEqual({ subscriptionId: 's2' });
  expect(call[1].headers).toMatchObject({ 'X-CSRF-Token': 'token' });
});
test('enable subscribes this browser and sends its user agent', async () => {
  const h = setup(false, 'granted'); render(<PushSettingsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enable on this device' }));
  await screen.findByText('Push notifications enabled on this device.');
  const call = h.fetchMock.mock.calls.find(c => c[0] === '/webPush/subscribe') as unknown as [string, RequestInit];
  expect(call).toBeTruthy();
  expect(JSON.parse(String(call[1].body)).userAgent).toBe(navigator.userAgent);
});
