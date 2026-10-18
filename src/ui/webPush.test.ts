import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
const script = await Bun.file(new URL('./$script_webPush.js', import.meta.url)).text();

async function fixture(opts: { denied?: boolean; subscribed?: boolean; owner?: string; ios?: boolean; stale?: boolean } = {}) {
  const win: any = new Window({ url: 'https://hyper.test/a/ab' });
  const calls: string[] = [];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('https://push.test/token'));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  win.TextEncoder = TextEncoder;
  Object.defineProperty(win, 'crypto', { value: crypto });
  let sub: any = opts.subscribed ? makeSub() : null;
  function makeSub() { return { endpoint: 'https://push.test/token', toJSON: () => ({ endpoint: 'https://push.test/token', keys: {} }), unsubscribe: async () => { calls.push('browser-unsubscribe'); sub = null; return true; } }; }
  const registration = { active: { scriptURL: 'https://hyper.test/webPush/web-push-sw.js' }, pushManager: { getSubscription: async () => sub, subscribe: async () => { calls.push('browser-subscribe'); return sub = makeSub(); } } };
  Object.defineProperty(win, 'isSecureContext', { value: true });
  win.PushManager = function () {};
  win.Notification = { permission: opts.denied ? 'denied' : 'default', requestPermission: async () => { calls.push('permission'); win.Notification.permission = 'granted'; return 'granted'; } };
  Object.defineProperty(win.navigator, 'serviceWorker', { value: { getRegistration: async () => registration, register: async () => { calls.push('register'); return registration; }, ready: Promise.resolve(registration) } });
  if (opts.ios) Object.defineProperty(win.navigator, 'userAgent', { value: 'iPhone' });
  win.fetch = async (url: string) => { calls.push(url); return { ok: true, json: async () => url.endsWith('/config') ? { enabled: true, publicKey: 'YWJj', userId: 'u', binding: 's', endpointHashes: opts.stale ? [] : [hash] } : { ok: true } }; };
  win.document.body.innerHTML = '<button id="web-push-toggle" disabled></button><p id="web-push-status"></p>';
  if (opts.owner) win.localStorage.setItem('hyper-push-binding', opts.owner);
  win.eval(script);
  await settle();
  return { win, calls, button: win.document.getElementById('web-push-toggle'), text: () => win.document.getElementById('web-push-status').textContent };
}
async function settle() { await new Promise(resolve => setTimeout(resolve, 10)); }

test('load never requests permission or installs/subscribes; explicit enable then disable is idempotent', async () => {
  const f = await fixture();
  try {
    expect(f.calls).toEqual(['/webPush/config']);
    f.button.click(); await settle();
    expect(f.calls).toContain('permission');
    expect(f.calls).toContain('/webPush/subscribe');
    expect(f.win.localStorage.getItem('hyper-push-binding')).toBe('u:s');
    f.button.click(); await settle();
    expect(f.calls).toContain('/webPush/unsubscribe');
    expect(f.calls).toContain('browser-unsubscribe');
    expect(f.win.localStorage.getItem('hyper-push-binding')).toBeNull();
  } finally { await f.win.happyDOM.close(); }
});
test('existing own subscription is shown without re-subscribing', async () => {
  const f = await fixture({ subscribed: true, owner: 'u:s' });
  try { expect(f.button.textContent).toContain('Disable'); expect(f.calls).toEqual(['/webPush/config']); }
  finally { await f.win.happyDOM.close(); }
});
test('user mismatch removes browser subscription and never silently rebinds', async () => {
  const f = await fixture({ subscribed: true, owner: 'other:session' });
  try { expect(f.calls).toEqual(['/webPush/config', 'browser-unsubscribe']); expect(f.button.textContent).toContain('Enable'); }
  finally { await f.win.happyDOM.close(); }
});
test('stale server subscription is disabled locally without a silent re-register', async () => {
  const f = await fixture({ subscribed: true, owner: 'u:s', stale: true });
  try { expect(f.calls).toEqual(['/webPush/config', 'browser-unsubscribe']); expect(f.button.textContent).toContain('Enable'); }
  finally { await f.win.happyDOM.close(); }
});
test('denied permission disables enable and gives recovery instructions', async () => {
  const f = await fixture({ denied: true });
  try { expect(f.button.disabled).toBe(true); expect(f.text()).toContain('device/browser settings'); expect(f.calls).not.toContain('permission'); }
  finally { await f.win.happyDOM.close(); }
});
test('iPhone browser explains home-screen install without any API or permission call', async () => {
  const f = await fixture({ ios: true });
  try { expect(f.text()).toContain('16.4'); expect(f.text()).toContain('Add to Home Screen'); expect(f.calls).toEqual([]); }
  finally { await f.win.happyDOM.close(); }
});
