import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from './navMenu';

const script = await Bun.file(new URL('../dock/$script_dock.js', import.meta.url)).text();

test('mobile menu theme toggle shares persisted theme and desktop icon state', async () => {
  const window = new Window({ url: 'http://localhost/files', width: 390, height: 844 });
  try {
    window.document.documentElement.dataset.theme = 'light';
    window.document.body.innerHTML = '<button id="theme-toggle" data-action="toggle-theme"><i></i></button>' + navMenu({} as Context, null, {});
    (window as any).hyperLive = { subscribe: () => {} };
    window.eval(script);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const button = window.document.getElementById('nav-theme-toggle')!;
    const desktop = window.document.getElementById('theme-toggle')!;
    expect(button.closest('#nav-overlay')).not.toBeNull();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('size-11');
    button.querySelector('i')!.click();
    expect(window.document.documentElement.dataset.theme).toBe('dark');
    expect(window.document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem('hyper-theme')).toBe('dark');
    for (const item of [button, desktop]) {
      expect(item.getAttribute('aria-pressed')).toBe('true');
      expect(item.getAttribute('aria-label')).toBe('Включить светлую тему');
      expect(item.querySelector('i')!.className).toContain('ph-sun');
    }
    desktop.click();
    expect(window.document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('hyper-theme')).toBe('light');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('i')!.className).toContain('ph-moon');
  } finally { await window.happyDOM.close(); }
});
