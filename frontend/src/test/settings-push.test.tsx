import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PushSettingsPanel } from '../components/settings/PushSettingsPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
function setup(existing = false) {
  const unsubscribe = vi.fn(async () => true);
  const requestPermission = vi.fn(async () => 'denied');
  const register = vi.fn();
  const sub = { endpoint: 'https://example.test/endpoint', unsubscribe };
  const getRegistration = vi.fn(async () => ({ active: { scriptURL: 'https://hyper.test/webPush/web-push-sw.js' }, pushManager: { getSubscription: async () => existing ? sub : null } }));
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration, register } });
  const config = { enabled: true, publicKey: 'key', userId: 'owner', binding: 'session', endpointHashes: [], csrf: 'token', preferences: [{ id: 'main', title: 'Main agent', input: true, error: true }] };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(config), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return { unsubscribe, requestPermission, register, fetchMock };
}
test('opening settings reads only; permission prompt requires button gesture', async () => {
  const h = setup(); render(<PushSettingsPanel />);
  await screen.findByText('Main agent');
  expect(h.requestPermission).not.toHaveBeenCalled(); expect(h.register).not.toHaveBeenCalled(); expect(h.unsubscribe).not.toHaveBeenCalled();
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Enable on this device' }));
  expect(h.requestPermission).toHaveBeenCalledTimes(1);
  await screen.findByText(/Notifications are blocked/); expect(h.register).not.toHaveBeenCalled();
});
test('unsubscribe requires explicit confirmation, then uses scoped CSRF transport', async () => {
  const h = setup(true); localStorage.setItem('hyper-push-binding', 'owner:session'); render(<PushSettingsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Disable on this device…' }));
  expect(h.unsubscribe).not.toHaveBeenCalled(); expect(h.fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));
  await waitFor(() => expect(h.unsubscribe).toHaveBeenCalledTimes(1));
  expect(h.fetchMock.mock.calls[1]).toMatchObject(['/webPush/unsubscribe', { method: 'POST', headers: { 'X-CSRF-Token': 'token' } }]);
});
test('independent agent switch posts true/absent contract and retains other switch', async () => {
  const h = setup(); render(<PushSettingsPanel />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Action required' }));
  await screen.findByText('Notification preferences saved.');
  const call = h.fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(call[0]).toBe('/webPush/preferences');
  expect(String(call[1].body)).toBe('agentId=main&csrf=token&error=true');
  expect(screen.getByRole('checkbox', { name: 'Action required' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Work stopped by error' })).toBeChecked();
});
