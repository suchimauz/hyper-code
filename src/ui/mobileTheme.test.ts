import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from './navMenu';
const script = await Bun.file(new URL('../dock/$script_dock.js', import.meta.url)).text();

async function fixture(saved: string | null = 'light', dark = false) {
  const window = new Window({ url: 'http://localhost/files', width: 390, height: 844 });
  const media = Object.assign(new window.EventTarget(), { matches: dark });
  window.matchMedia = (() => media) as any;
  if (saved) window.localStorage.setItem('hyper-theme', saved);
  window.document.head.innerHTML = '<meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-status-bar-style" content="default">';
  window.document.body.innerHTML = '<button id="theme-toggle" data-action="toggle-theme"><i></i></button>' + navMenu({} as Context, null, {});
  (window as any).hyperLive = { subscribe: () => {} };
  window.eval(script);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, media, root: window.document.documentElement, button: window.document.getElementById('nav-theme-toggle')!, desktop: window.document.getElementById('theme-toggle')!, meta: () => window.document.querySelector('meta[name="theme-color"]')!.getAttribute('content') };
}

test('mobile and desktop cycle light/dark/auto with immediate browser chrome updates', async () => {
  const f = await fixture();
  try {
    f.button.querySelector('i')!.click();
    expect(f.root.dataset.theme).toBe('dark');
    expect(f.root.style.colorScheme).toBe('dark');
    expect(f.meta()).toBe('#252a34');
    expect(f.window.document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')!.getAttribute('content')).toBe('black');
    expect(f.window.localStorage.getItem('hyper-theme')).toBe('dark');
    for (const item of [f.button, f.desktop]) {
      expect(item.getAttribute('aria-label')).toContain('Auto');
      expect(item.querySelector('i')!.className).toContain('ph-moon');
    }
    f.desktop.click();
    expect(f.root.dataset.themeMode).toBe('auto');
    expect(f.root.dataset.theme).toBe('light');
    expect(f.meta()).toBe('#ffffff');
    expect(f.window.localStorage.getItem('hyper-theme')).toBe('auto');
    expect(f.button.querySelector('i')!.className).toContain('ph-desktop');
    f.button.click();
    expect(f.root.dataset.themeMode).toBe('light');
  } finally { await f.window.happyDOM.close(); }
});

test('auto follows live system changes; explicit choice ignores them; storage stays synced', async () => {
  const f = await fixture('auto', true);
  try {
    expect(f.root.dataset.theme).toBe('dark');
    f.media.matches = false; f.media.dispatchEvent(new f.window.Event('change'));
    expect(f.root.dataset.theme).toBe('light'); expect(f.meta()).toBe('#ffffff');
    f.button.click(); // explicit light
    f.media.matches = true; f.media.dispatchEvent(new f.window.Event('change'));
    expect(f.root.dataset.theme).toBe('light');
    f.window.dispatchEvent(new f.window.StorageEvent('storage', { key: 'hyper-theme', newValue: 'auto' }));
    expect(f.root.dataset.theme).toBe('dark'); expect(f.meta()).toBe('#252a34');
  } finally { await f.window.happyDOM.close(); }
});

test('no saved preference defaults to system and pageshow refreshes browser chrome', async () => {
  const f = await fixture(null, true);
  try {
    expect(f.root.dataset.themeMode).toBe('auto'); expect(f.root.dataset.theme).toBe('dark');
    f.media.matches = false;
    f.window.dispatchEvent(new f.window.Event('pageshow'));
    expect(f.meta()).toBe('#ffffff'); expect(f.root.style.colorScheme).toBe('light');
  } finally { await f.window.happyDOM.close(); }
});

test('theme-color node is replaced on paint and rapid toggles keep only the latest color', async () => {
  const f = await fixture('light');
  try {
    await new Promise(resolve => f.window.requestAnimationFrame(resolve));
    const old = f.window.document.querySelector('meta[name="theme-color"]');
    f.button.click(); // dark
    f.button.click(); // auto, system light
    await new Promise(resolve => f.window.requestAnimationFrame(resolve));
    expect(f.window.document.querySelector('meta[name="theme-color"]')).not.toBe(old);
    expect(f.window.document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(f.meta()).toBe('#ffffff');
    expect(f.root.dataset.theme).toBe('light');
  } finally { await f.window.happyDOM.close(); }
});

test('mobile menu retains opaque theme-matched safe-area background', async () => {
  const source = await Bun.file(new URL('./layout.ts', import.meta.url)).text();
  expect(source).toContain('#nav-overlay { background: var(--color-base-100); backdrop-filter: none; -webkit-backdrop-filter: none; }');
  expect(source).toContain('padding: max(.5rem, env(safe-area-inset-top))');
});
