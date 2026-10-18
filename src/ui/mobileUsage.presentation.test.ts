import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import chrome from '../projects/renderChrome';
import layout from './layout';
const ctx: any = { state: {}, fns: { procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(String(text)), button: () => '' } }, ui: { popup: () => '', faviconUrl: async () => '/favicon.ico', navMenu: () => '' }, dock: { render: async () => '' } } };
async function markup() {
 const result = await chrome(ctx, null, { projects: [{ id: 'p', title: 'Project', dir: '/p', host: '' }], projectId: 'p', chats: [], tabIds: [] });
 return { tabs: result.tabs, html: await layout(ctx, null, { main: '<div id="project-tabs-host">' + result.tabs + '</div>' }) };
}
test('read-only strip follows the mobile project bar and is a single accessible dialog trigger', async () => {
 const { tabs } = await markup(); const w = new Window();
 try {
  w.document.body.innerHTML = tabs;
  const strip = w.document.querySelector('[data-mobile-usage-open]')!;
  expect(strip.previousElementSibling!.className).toBe('project-mobile-bar');
  expect(strip.tagName).toBe('BUTTON'); expect(strip.getAttribute('type')).toBe('button'); expect(strip.getAttribute('aria-haspopup')).toBe('dialog');
  expect(strip.querySelector('[data-mobile-usage-count]')).not.toBeNull();
  expect(strip.querySelector('.mobile-usage-caption')).toBeNull(); expect(strip.textContent).not.toContain('Лимиты');
  expect(strip.hasAttribute('hx-post')).toBe(false); expect(strip.hasAttribute('hx-popup')).toBe(false);
 } finally { await w.happyDOM.close(); }
});
test('strip and fullscreen overview share mobile breakpoint; desktop strip remains hidden', async () => {
 const { tabs, html } = await markup();
 const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
 for (const [width, touch] of [[320, 5], [390, 5], [844, 5], [1280, 0]]) {
  const w = new Window({ width, height: 844 }); Object.defineProperty(w.navigator, 'maxTouchPoints', { value: touch });
  try {
   w.document.body.innerHTML = tabs + '<dialog open class="mobile-usage-dialog"><header><button>Назад</button><h2>Лимиты</h2></header><div class="mobile-usage-content"></div></dialog>';
   w.document.querySelector('[data-mobile-usage-items]')!.innerHTML = '<span class="mobile-usage-chip"><span class="mobile-usage-ring"><span class="mobile-usage-logo"><i class="ph ph-cpu"></i></span><span class="mobile-usage-proxy">↔</span></span></span>';
   const style = w.document.createElement('style');
   style.textContent = css.replace(/@media\s+([^{}]+)\{/g, (_m, q: string) => `@media ${q.split(',').some(part => w.matchMedia(part.trim()).matches) ? '(min-width: 0px)' : '(min-width: 999999px)'} {`);
   w.document.head.append(style);
   const strip = w.getComputedStyle(w.document.querySelector('[data-mobile-usage-open]')!);
   expect(strip.display).toBe(width < 1024 ? 'flex' : 'none');
   if (width < 1024) {
    expect(strip.minHeight).toBe('44px'); expect(strip.height).toBe('44px'); expect(w.getComputedStyle(w.document.querySelector('dialog')!).position).toBe('fixed');
    const chip=w.getComputedStyle(w.document.querySelector('.mobile-usage-chip')!);
    expect(chip.height).toBe('32px'); expect(chip.width).toBe('32px'); expect(chip.flexDirection).not.toBe('column');
    expect(w.getComputedStyle(w.document.querySelector('.mobile-usage-ring')!).height).toBe('28px');
   }
   expect(w.getComputedStyle(w.document.querySelector('dialog button')!).minHeight).toBe('44px');
   expect(w.getComputedStyle(w.document.querySelector('.mobile-usage-content')!).overflowY).toBe('auto');
  } finally { await w.happyDOM.close(); }
 }
 expect(html).toContain('/ui/mobileUsage.js');
});
