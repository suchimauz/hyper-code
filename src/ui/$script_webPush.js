// Explicit opt-in only. No permission prompt, worker install, or server subscription on load.
(function () {
  'use strict';
  const ownerKey = 'hyper-push-binding';
  const workerPath = '/webPush/web-push-sw.js';
  const button = document.getElementById('web-push-toggle');
  const status = document.getElementById('web-push-status');
  if (!button || !status) return;
  let config, subscription, registration, busy = false;
  const say = text => { status.textContent = text; };
  const binding = () => config && config.userId + ':' + config.binding;
  const stored = () => { try { return localStorage.getItem(ownerKey); } catch (_) { return null; } };
  const remember = value => { try { if (value) localStorage.setItem(ownerKey, value); else localStorage.removeItem(ownerKey); } catch (_) { /* Never use missing storage as proof of ownership. */ } };
  const api = async (path, data) => {
    const response = await fetch('/webPush/' + path, { credentials: 'same-origin', cache: 'no-store',
      ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' }, body: JSON.stringify(data) } : {}) });
    if (!response.ok) throw new Error('Notification settings could not be saved. Please sign in again or retry.');
    return response.json();
  };
  const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  const render = () => {
    button.textContent = subscription ? 'Disable push notifications' : 'Enable push notifications';
    button.disabled = busy || (!subscription && (!config?.enabled || Notification.permission === 'denied'));
  };
  const removeBrowser = async () => {
    if (subscription && !(await subscription.unsubscribe())) throw new Error('Could not remove browser subscription. Please retry.');
    subscription = null; remember(null);
  };
  const refresh = async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      config = await api('config');
      registration = await navigator.serviceWorker.getRegistration('/');
      if (registration && ![registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === workerPath)) registration = null;
      // Refresh only our existing worker; never install or request permission on page load.
      if (registration?.update) void registration.update().catch(() => {});
      subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription && stored() !== binding()) await removeBrowser();
      if (subscription) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (!Array.isArray(config.endpointHashes) || !config.endpointHashes.includes(hash)) await removeBrowser();
      }
      say(subscription ? 'Enabled on this device: action requests and stopping errors. Choose types in each Agent Inspector.' : !config.enabled ? 'Push notifications are not configured on this server.' : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in device/browser settings, then reopen Hyper.' : 'Optional: action requests and stopping errors from main agents. Choose types in each Agent Inspector.');
    } catch (error) { say(error.message); config = null; }
    finally { busy = false; render(); }
  };
  button.addEventListener('click', async () => {
    if (busy || !config) return;
    // Request in the button gesture, before any network await (required by iOS).
    const permission = !subscription && Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true; render();
    try {
      if (subscription) {
        await api('unsubscribe', { endpoint: subscription.endpoint });
        await removeBrowser();
        say('Push notifications disabled on this device.');
      } else {
        if (await permission !== 'granted') { say('Notifications were not allowed. You can change this in device/browser settings.'); return; }
        const fresh = await api('config');
        if (!fresh.enabled || fresh.binding !== config.binding || fresh.userId !== config.userId) throw new Error('Your sign-in changed. Reopen Hyper and enable notifications again.');
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing && ![existing.active, existing.waiting, existing.installing].some(worker => worker && new URL(worker.scriptURL).pathname === workerPath)) throw new Error('Another service worker already uses this scope. Ask your administrator before replacing it.');
        registration = await navigator.serviceWorker.register(workerPath, { scope: '/', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
        const key = Uint8Array.from(raw, char => char.charCodeAt(0));
        subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        try { await api('subscribe', { subscription: subscription.toJSON() }); }
        catch (error) { await removeBrowser(); throw error; }
        remember(binding());
        say('Enabled on this device: action requests and stopping errors. Choose types in each Agent Inspector.');
      }
    } catch (error) { say(error.message || 'Could not update notifications. Please retry.'); }
    finally { busy = false; render(); }
  });
  if (ios && !standalone()) {
    button.disabled = true;
    say('iPhone/iPad: requires iOS/iPadOS 16.4 or later. In Safari, use Share → Add to Home Screen, then open Hyper from that icon to enable notifications.');
  } else if (!supported()) {
    button.disabled = true;
    say('Push needs HTTPS and a supported browser. On iPhone/iPad use iOS/iPadOS 16.4+ and open Hyper from its Home Screen icon.');
  } else {
    void refresh();
    window.addEventListener('pageshow', () => { void refresh(); });
    window.addEventListener('storage', event => { if (event.key === ownerKey) void refresh(); });
  }
})();
