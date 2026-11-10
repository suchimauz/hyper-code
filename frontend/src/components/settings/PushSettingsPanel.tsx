import { useEffect, useRef, useState } from 'react';
import { BellOff, Check, X } from 'lucide-react';
import { requestJson } from '../../lib/hyper';
import { Button } from '../ui/Button';
import { PushDevices, type PushDevice } from './PushDevices';

type Config = { enabled: boolean; publicKey: string | null; userId: string; binding: string; devices: PushDevice[]; csrf: string };
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
  const [deviceHash, setDeviceHash] = useState<string | null>(null);
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
        if (active) { setConfig(next); setSubscription(sub); setMessage(unavailable || (sub ? 'A browser subscription exists on this device. Disable it before switching accounts or re-enabling.' : next.enabled ? 'Enable device notifications on each device you want to be notified on.' : 'Push is not configured on this server.')); }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Could not load settings.'); }
      finally { if (active) setBusy(false); }
    };
    void refresh();
    return () => { active = false; };
  }, [unavailable]);
  useEffect(() => {
    let active = true;
    // Identify this browser's own device row by hashing its subscription endpoint locally.
    const hashEndpoint = async () => {
      if (!subscription?.endpoint) { if (active) setDeviceHash(null); return; }
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
      if (active) setDeviceHash([...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
    };
    void hashEndpoint();
    return () => { active = false; };
  }, [subscription]);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  // Other devices enable or disable their own push at any time; poll quietly while this panel is open.
  useEffect(() => {
    let active = true;
    const quiet = async () => {
      if (document.hidden || busyRef.current) return;
      try {
        const next = await requestJson<Config>('/webPush/config');
        if (!active) return;
        let sub: PushSubscription | null = null;
        if (!unavailable) { const registration = await navigator.serviceWorker.getRegistration('/'); sub = registration && ownsWorker(registration) ? await registration.pushManager.getSubscription() : null; }
        if (active) { setConfig(next); setSubscription(sub); }
      } catch { /* Quiet poll; the next tick or any explicit action retries. */ }
    };
    const timer = window.setInterval(() => { void quiet(); }, 5000);
    const onVisible = () => { if (!document.hidden) void quiet(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
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
      try { await post('subscribe', { subscription: sub.toJSON(), userAgent: navigator.userAgent }, fresh); }
      catch (error) { if (!await sub.unsubscribe()) setSubscription(sub); throw error; }
      remember(binding(fresh)); setSubscription(sub);
      try { setConfig(await requestJson<Config>('/webPush/config')); } catch { setConfig(fresh); }
      setMessage('Push notifications enabled on this device.');
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
      try { setConfig(await requestJson<Config>('/webPush/config')); } catch { /* List refresh is cosmetic; the result message above stays. */ }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not disable notifications.'); }
    finally { setBusy(false); }
  };
  // Owner-scoped removal from Settings: retires another device's subscription; that browser keeps its local subscription until it disables notifications itself.
  const removeDevice = async (id: string) => {
    if (!config || busy) return;
    setBusy(true);
    try {
      await post('unsubscribe', { subscriptionId: id }, config);
      const next = await requestJson<Config>('/webPush/config');
      setConfig(next);
      setMessage(next.devices.some(device => device.id === id) ? 'Could not remove the device. Try again.' : 'Device removed. It can re-enable notifications itself.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove the device.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Push notifications">
    <h2>Push notifications</h2><p className="settings-note">Optional notifications for action requests and errors that stop work. No prompt or subscription is created until you enable them.</p>
    <p role="status" aria-live="polite">{message}</p>
    {subscription ? (confirmDisable
      ? <div role="group" aria-label="Confirm disable notifications"><p>Remove this browser’s push subscription? Other devices are not affected.</p><span className="push-confirm-actions"><Button variant="ghost" size="compact" className="push-device-remove" aria-label="Confirm disable" title="Confirm disable" disabled={busy} onClick={() => { void disable(); }}><Check size={16} strokeWidth={2} aria-hidden="true" /></Button><Button variant="ghost" size="compact" aria-label="Cancel" title="Cancel" disabled={busy} onClick={() => setConfirmDisable(false)}><X size={16} strokeWidth={2} aria-hidden="true" /></Button></span></div>
      : <Button disabled={busy} onClick={() => setConfirmDisable(true)}><BellOff size={16} strokeWidth={1.75} aria-hidden="true" />Disable on this device</Button>) : <Button disabled={busy || !!unavailable || !config?.enabled} onClick={() => { void enable(); }}>Enable on this device</Button>}
    <h3>Connected devices</h3>
    <PushDevices devices={config ? config.devices : null} currentHash={deviceHash} onRemove={(id) => { void removeDevice(id); }} busy={busy} />
    <p className="settings-footnote">Notifications are sent for action requests and errors that stop work. Each device manages its own subscription.</p>
  </section>;
}
