import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderCtx } from './testRender.entry';

// Render the real composer and resource footer together: a textarea stand-in misses
// the composer's own safe-area margin and is unable to catch the doubled inset.
async function fixture(width: number, inset: number, dark = false, footer: 'visible' | 'hidden' | 'absent' = 'visible') {
    const window = new Window({ width, height: 844, settings: { enableJavaScriptEvaluation: false } });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5 });
    const ctx = await renderCtx({ 'ui.faviconUrl': () => '/favicon.ico', 'ui.navMenu': () => '', 'dock.render': () => '' });
    const compose = await ctx.fns.ui.chatComposer({ action: '/agent/test' });
    const monitor = footer === 'absent' ? '' : await ctx.fns.ui.resourceMonitor({ agentId: 'test' });
    const main = `<div data-page="agent"><section id="chat-panel"><div id="messages">Chat</div>${compose}${monitor}</section></div>`;
    const html = await ctx.fns.ui.layout({ main });
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
        .replace(/@media\s+([^{}]+)\{/g, (_match, query: string) => `@media ${query.split(',').some(part => window.matchMedia(part.trim()).matches) ? '(min-width: 0px)' : '(min-width: 999999px)'} {`)
        .replaceAll('env(safe-area-inset-bottom)', `${inset}px`)
        .replaceAll(`max(.25rem, ${inset}px)`, `${Math.max(4, inset)}px`);
    const background = dark ? '#1c232a' : '#ffffff';
    window.document.head.innerHTML = `<style>:root { --color-base-100:${background}; --color-base-200:${dark ? '#141b23' : '#eeeeee'}; --color-canvas:${dark ? '#101820' : '#f8fafb'}; --color-ui-border:#888888; } .pb-2 { padding-bottom: 8px; } ${styles}</style>`;
    window.document.body.innerHTML = main;
    if (footer === 'visible') window.document.querySelector('[data-resource-dock]')!.removeAttribute('hidden');
    const css = (selector: string) => window.getComputedStyle(window.document.querySelector(selector)!);
    return { window, css, background };
}

test('mobile composer and resource footer continue the chat surface in both themes', async () => {
    for (const width of [320, 390, 844]) for (const dark of [false, true]) {
        const f = await fixture(width, 34, dark);
        try {
            expect(f.css('.chat-composer').backgroundColor).toBe('transparent');
            // Happy DOM keeps the CSS-wide keyword; Chromium resolves it to the parent color.
            expect(f.css('[data-resource-dock]').backgroundColor).toBe('inherit');
            expect(f.css('#chat-panel').backgroundColor).toBe(f.background);
            expect(f.css('[data-resource-open]').minHeight).toBe('44px');
            expect(f.css('[data-resource-open]').width).toBe('100%');
        } finally { await f.window.happyDOM.close(); }
    }
});

test('only the visible footer reserves bottom safe-area space, never the gap after the input', async () => {
    for (const inset of [0, 21, 34]) {
        const f = await fixture(390, inset);
        try {
            expect(f.css('.chat-composer').marginBottom).toBe('0px');
            expect(f.css('.chat-composer').paddingBottom).toBe('2px');
            expect(f.css('[data-resource-dock]').paddingBottom).toBe(`${Math.max(4, inset)}px`);
        } finally { await f.window.happyDOM.close(); }
    }
});

test('without a visible resource footer the composer still protects the home indicator', async () => {
    for (const footer of ['hidden', 'absent'] as const) {
        const f = await fixture(390, 34, false, footer);
        try {
            expect(f.css('.chat-composer').marginBottom).toBe('34px');
            expect(f.css('.chat-composer').paddingBottom).toBe('8px');
        } finally { await f.window.happyDOM.close(); }
    }
});

test('desktop composer spacing is not changed by the mobile footer fix', async () => {
    const f = await fixture(1280, 0);
    try {
        expect(f.css('.chat-composer').marginBottom).toBe('8px');
        expect(f.css('.chat-composer').paddingBottom).toBe('8px');
        expect(f.css('[data-resource-open]').minHeight).toBe('28px');
    } finally { await f.window.happyDOM.close(); }
});
