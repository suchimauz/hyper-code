import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/hyper';
import { Button } from '../ui/Button';

type Preference = { id: string; title: string | null; input: boolean; error: boolean };
type Config = { enabled: boolean; publicKey: string | null; userId: string; binding: string; endpointHashes: string[]; csrf: string; preferences: Preference[] };
const workerPath = '/webPush/web-push-sw.js';
const ownerKey = 'hyper-push-binding';
const ownsWorker = (registration: ServiceWorkerRegistration) => [registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === workerPath);
const binding = (config: Config) => `${config.userId}:${config.binding}`;
function storedBinding() { try { return localStorage.getItem(ownerKey); } catch { return null; } }
function remember(value: string | null) { try { if (value) localStorage.setItem(ownerKey, value); else localStorage.removeItem(ownerKey); } catch { /* Storage is not proof of ownership when unavailable. */ } }
function availability() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone) return 'On iPhone/iPad (16.4+), add Hyper to your Home Screen in Safari and open it from that icon.';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Push needs HTTPS and a supported browser.';
  return null;
}

/** Device opt-in is explicit; opening settings only reads configuration and existing subscriptions. */
export function PushSettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Loading notification settings…');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [unavailable] = useState(availability);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await requestJson<Config>('/webPush/config');
        let sub: PushSubscription | null = null;
        if (!unavailable) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          sub = registration && ownsWorker(registration) ? await registration.pushManager.getSubscription() : null;
        }
        // Never mutate a stale browser subscription merely by opening settings.
        if (active) { setConfig(next); setSubscription(sub); setMessage(unavailable || (sub ? 'A browser subscription exists on this device. Disable it before switching accounts or re-enabling.' : next.enabled ? 'Enable device notifications, then choose which main agents can notify you.' : 'Push is not configured on this server.')); }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not load settings.'); }
      finally { if (active) setBusy(false); }
    };
    void refresh();
    return () => { active = false; };
  }, [unavailable]);
  const post = (path: string, data: object, current: Config) => requestJson(`/webPush/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.csrf }, body: JSON.stringify(data) });
  const enable = async () => {
    if (!config || busy) return;
    // Must happen synchronously in the button gesture, before network or worker awaits.
    const permission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    setBusy(true);
    try {
      if (await permission !== 'granted') throw new Error('Notifications are blocked or were not allowed. Change browser/device settings to allow them.');
      const fresh = await requestJson<Config>('/webPush/config');
      if (!fresh.enabled || !fresh.publicKey || binding(fresh) !== binding(config)) throw new Error('Your sign-in changed. Reopen notification settings.');
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing && !ownsWorker(existing)) throw new Error('Another service worker owns this scope. Ask your administrator before replacing it.');
      const registration = await navigator.serviceWorker.register(workerPath, { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) throw new Error('A subscription already exists. Reopen settings and disable it first.');
      const key = Uint8Array.from(atob(fresh.publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
      const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      try { await post('subscribe', { subscription: sub.toJSON() }, fresh); }
      catch (error) { if (!await sub.unsubscribe()) setSubscription(sub); throw error; }
      remember(binding(fresh)); setConfig(fresh); setSubscription(sub); setMessage('Push notifications enabled on this device.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not enable notifications.'); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    if (!config || !subscription || busy) return;
    setBusy(true);
    try {
      // Server deletion is always owner/session scoped; never transfer another account’s endpoint.
      if (storedBinding() === binding(config)) await post('unsubscribe', { endpoint: subscription.endpoint }, config);
      if (!await subscription.unsubscribe()) throw new Error('Could not remove the browser subscription. Retry.');
      remember(null); setSubscription(null); setConfirmDisable(false); setMessage('Push notifications disabled on this device.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not disable notifications.'); }
    finally { setBusy(false); }
  };
  const save = async (preference: Preference, key: 'input' | 'error', value: boolean) => {
    if (!config || busy) return;
    const next = { ...preference, [key]: value };
    const body = new URLSearchParams({ agentId: next.id, csrf: config.csrf, ...(next.input ? { input: 'true' } : {}), ...(next.error ? { error: 'true' } : {}) });
    setBusy(true);
    try {
      await requestJson('/webPush/preferences', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      setConfig({ ...config, preferences: config.preferences.map(item => item.id === next.id ? next : item) }); setMessage('Notification preferences saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Push notifications">
    <h2>Push notifications</h2><p className="settings-note">Optional notifications for action requests and errors that stop work. No prompt or subscription is created until you enable them.</p>
    <p role="status" aria-live="polite">{message}</p>
    {subscription ? <><Button disabled={busy} onClick={() => setConfirmDisable(true)}>Disable on this device…</Button>{confirmDisable && <div role="group" aria-label="Confirm disable notifications"><p>Remove this browser’s push subscription? Other devices are not affected.</p><Button disabled={busy} onClick={() => { void disable(); }}>Confirm disable</Button><Button disabled={busy} onClick={() => setConfirmDisable(false)}>Cancel</Button></div>}</> : <Button disabled={busy || !!unavailable || !config?.enabled} onClick={() => { void enable(); }}>Enable on this device</Button>}
    <h3>Main agents</h3>{config?.preferences.length === 0 && <p>No eligible main agents.</p>}
    {config?.preferences.map(item => <fieldset key={item.id} disabled={busy}><legend>{item.title || item.id}</legend><label className="settings-check"><input type="checkbox" checked={item.input} onChange={event => { void save(item, 'input', event.target.checked); }} />Action required</label><label className="settings-check"><input type="checkbox" checked={item.error} onChange={event => { void save(item, 'error', event.target.checked); }} />Work stopped by error</label></fieldset>)}
  </section>;
}
