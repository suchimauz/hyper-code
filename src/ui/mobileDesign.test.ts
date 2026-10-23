import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import layout from './layout';
import composer from './chatComposer';
import rows from '../nav/rows';
import header from '../chat/header';

// Isolated renderer tests: no production or test database is needed for presentation rules.
const context = {
    state: {},
    fns: {
        procs: { ui: {
            escape: ({ text }: { text: unknown }) => Bun.escapeHTML(String(text)),
            attr: () => 'data-form="chat"',
            button: () => '',
        } },
        ui: {
            modelLogo: () => '<svg data-test-model-logo></svg>',
            faviconUrl: async () => '/favicon.ico', navMenu: () => '',
            popup: ({ html, attrs }: { html: string; attrs: string }) => `<button ${attrs}>${html}</button>`,
            inplacePopup: async () => '<button aria-label="Chat panel">More</button>',
        },
        dock: { render: async () => '' },
        chat: { icon: () => '<i class="model-icon"></i>', renderParts: async () => [] },
    },
} as unknown as Context;

async function fixture(width: number, touchPoints: number, controlsHtml = '<button type="submit" data-composer-send>Send</button>') {
    const window = new Window({ width, height: 844, settings: { enableJavaScriptEvaluation: false } });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touchPoints });
    const compose = await composer(context, null, { action: '/agent/demo', controlsHtml, toolsHtml: '<button data-chat-part="model">Model</button><button data-chat-part="effort">High</button>', metersHtml: '<button data-context-meter><span data-context-total>95k/100k</span><span class="chat-ring"></span></button>' });
    const chatHeader = await header(context, null, { context: { agent: { id: 'ab', title: 'A long chat title', model: 'test:echo' } } as any });
    const nav = await rows(context, null, { items: [{ id: 'agent:ab', href: '/agent/ab', label: 'Chat title', model: 'test:echo', pin: 'agent:ab' }], pinned: new Set<string>() });
    const main = `<main id="main"><div id="project-tabs-host"><div class="project-mobile-bar"><a class="project-mobile-name"><span class="project-title">Hyper</span></a><details class="project-mobile-switcher"><summary>Чаты 3</summary><nav class="project-mobile-menu"><a class="project-mobile-chat">Current</a></nav></details></div><div class="project-tabs">Desktop project tabs</div></div><div data-page="agent"><section id="chat-panel">${chatHeader}<div id="messages" class="chat-dot-grid"><div class="assistant chat-glass"><div class="prose">Answer<div class="chat-table-block"><div class="chat-table-hint">Листайте вбок</div><div class="chat-table-scroll"><table><thead><tr><th>ID</th><th>Описание</th></tr></thead><tbody><tr><td>141811</td><td>Длинное описание задачи</td></tr></tbody></table></div></div></div></div><div class="chat-glass-primary"><span data-author="user" style="color:rgb(200,200,255)">Person</span>Question<span data-no-copy>10:30</span><span data-mention="user">@person</span></div></div>${compose}</section></div></main><div id="nav-overlay">${nav}</div>`;
    const html = await layout(context, null, { main });
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
    // happy-dom's media-list/max() handling differs from browsers. Resolve only those
    // constructs in the harness; source assertions below retain the actual CSS contract.
    const resolved = styles.replace(/@media\s+([^{}]+)\{/g, (_match, query: string) =>
        `@media ${query.split(',').some(part => window.matchMedia(part.trim()).matches) ? '(min-width: 0px)' : '(min-width: 999999px)'} {`)
        .replaceAll('max(16px, 1.0625rem)', '17px');
    window.document.body.innerHTML = main;
    window.document.querySelector('#form')!.setAttribute('data-composer-settings-ready', '');
    const style = window.document.createElement('style');
    style.textContent = ':root{--color-base-100:#ffffff;--color-base-200:#eeeeee;--color-base-300:#dddddd;--color-base-content:#222222;--color-muted:#555555;--color-ui-border:#cccccc}.text-sm{font-size:14px}.font-mono{font-family:monospace}.text-xs{font-size:12px}.prose{font-size:14px}.chat-glass-primary{color:white}' + resolved;
    window.document.head.append(style);
    return { window, html, styles, compose, chatHeader, nav, css: (selector: string) => window.getComputedStyle(window.document.querySelector(selector)!) };
}

test('mobile reading is 17px, quiet, and technical IDs are hidden only on phones', async () => {
    for (const [width, touchPoints] of [[390, 5], [844, 5], [600, 0]]) {
        const f = await fixture(width, touchPoints);
        try {
            expect(f.css('#chat-panel .prose').fontSize).toBe('17px');
            expect(f.css('#nav-overlay [data-nav-label]').fontSize).toBe('17px');
            expect(f.css('#chat-panel [data-chat-part="name"]').fontSize).toBe('17px');
            expect(f.css('#chat-panel #messages').backgroundImage).toBe('none');
            expect(f.css('#chat-panel .assistant').boxShadow).toBe('none');
            expect(f.css('#chat-panel .assistant').backdropFilter).toBe('none');
            expect(f.css('[data-chat-technical-id]').display).toBe('none');
            expect(f.css('[data-nav-technical-id]').display).toBe('none');
            expect(f.css('[data-composer-toolbar]').flexWrap).toBe('wrap');
            expect(f.css('.project-tabs').display).toBe('none');
            expect(f.css('.project-mobile-bar').display).toBe('flex');
            expect(f.css('#project-tabs-host').display).not.toBe('none');
            expect(f.css('[data-chat-model-mark]').display).toBe('inline-flex');
            expect(f.css('[data-chat-avatar]').display).toBe('none');
            expect(f.css('[data-context-total]').display).not.toBe('none');
            expect(f.css('.chat-table-scroll').display).toBe('block');
            expect(f.css('.chat-table-scroll').overflowX).toBe('auto');
            expect(f.css('.chat-table-scroll > table').display).toBe('table');
            expect(f.css('.chat-table-scroll > table').maxWidth).toBe('none');
            expect(f.css('table td').wordBreak).toBe('normal');
            expect(f.css('table td').overflowWrap).toBe('break-word');
            expect(f.css('table th').whiteSpace).toBe('nowrap');
            expect(f.css('table td').minWidth).toBe('72px');
            expect(f.css('.chat-table-hint').display).toBe('block');
            expect(f.window.document.querySelector('[data-chat-meters]')!.closest('[data-composer-settings]')).toBeNull();
            expect(f.css('#chat-panel > header').position).toBe('relative');
            expect(f.css('#chat-panel > header').marginTop).toBe('0px');
            expect(f.css('[data-composer-settings]').display).toBe('none');
            expect(f.css('[data-composer-settings-toggle]').display).toBe('inline-flex');
            expect(f.css('[data-chat-jump-wrap]').position).toBe('absolute');
            expect(f.css('[data-chat-jump]').display).toBe('none');
            f.window.document.querySelector('[data-chat-jump]')!.removeAttribute('hidden');
            expect(f.css('[data-chat-jump]').display).toBe('inline-flex');
            expect(f.css('[data-chat-jump]').minHeight).toBe('44px');
            f.window.document.querySelector('#form')!.setAttribute('data-composer-send-ready', '');
            expect(f.css('[data-composer-send]').display).toBe('none');
            f.window.document.querySelector('#form')!.setAttribute('data-composer-has-content', '');
            // happy-dom caches descendant computed style after ancestor attribute changes.
            const updatedForm = f.window.document.querySelector('#form')!;
            updatedForm.replaceWith(updatedForm.cloneNode(true));
            expect(f.css('[data-composer-send]').display).not.toBe('none');
            f.window.document.querySelector('[data-composer-settings]')!.setAttribute('data-open', '');
            expect(f.css('[data-composer-settings]').display).toBe('flex');
            expect(f.css('[data-composer-settings]').order).toBe('10');
            expect(f.css('#chat-panel .chat-glass-primary').color).toBe('#222222');
            expect(f.css('#chat-panel [data-mention]').color).toBe('#222222');
            expect(f.css('#chat-panel [data-author]').color).toBe('#222222');
        } finally { await f.window.happyDOM.close(); }
    }
});

test('desktop keeps compact type, technical IDs and existing textures', async () => {
    const f = await fixture(1280, 0);
    try {
        expect(f.css('#chat-panel .prose').fontSize).toBe('14px');
        expect(f.css('#nav-overlay [data-nav-label]').fontSize).toBe('12px');
        expect(f.css('[data-chat-technical-id]').display).not.toBe('none');
        expect(f.css('[data-nav-technical-id]').display).not.toBe('none');
        expect(f.css('#chat-panel #messages').backgroundImage).not.toBe('none');
        expect(f.css('#chat-panel .assistant').backdropFilter).toBe('blur(2px)');
        expect(f.css('[data-composer-toolbar]').flexWrap).not.toBe('wrap');
        expect(f.css('#project-tabs-host').display).not.toBe('none');
        expect(f.css('.project-mobile-bar').display).toBe('none');
        expect(f.css('[data-chat-model-mark]').display).toBe('none');
        expect(f.css('[data-chat-avatar]').display).not.toBe('none');
        expect(f.css('.chat-ring').display).toBe('block');
        expect(f.css('.chat-table-scroll').display).toBe('contents');
        expect(f.css('.chat-table-block').display).toBe('contents');
        expect(f.css('.chat-table-hint').display).toBe('none');
        expect(f.css('[data-chat-status]').order).toBe('1');
        expect(f.css('[data-dictate]').order).toBe('2');
        expect(f.css('[data-composer-settings]').display).toBe('contents');
        expect(f.css('[data-composer-settings-toggle]').display).toBe('none');
        expect(f.css('[data-chat-jump-wrap]').display).toBe('none');
        f.window.document.querySelector('#form')!.setAttribute('data-composer-send-ready', '');
        expect(f.css('[data-composer-send]').display).not.toBe('none');
        expect(f.css('textarea').fontSize).toBe('14px');
    } finally { await f.window.happyDOM.close(); }
});

test('real submission, model/effort controls, pin forms and scalable anti-zoom input are preserved', async () => {
    const f = await fixture(390, 5);
    try {
        expect(f.compose).toContain('hx-post="/agent/demo"');
        expect(f.compose).toContain('hx-encoding="multipart/form-data"');
        expect(f.compose).toContain('aria-label="Message to agent"');
        for (const hook of ['data-chat-part="model"', 'data-chat-part="effort"', 'data-chat-meters', 'data-composer-submit', 'data-dictate', 'data-attach-button']) expect(f.compose).toContain(hook);
        expect(f.nav).toContain('href="/agent/ab"');
        expect(f.nav).toContain('hx-post="/nav/agent/ab/pin"');
        expect(f.styles).toContain('font-size: max(16px, 1.0625rem) !important; line-height: 1.5');
        expect(f.styles).toContain('prefers-reduced-motion');
        expect(f.styles).toContain('prefers-reduced-transparency');
        expect(f.styles).toContain('prefers-contrast');
        const viewport = /<meta name="viewport"[^>]*>/.exec(f.html)?.[0] ?? '';
        expect(viewport).toContain('initial-scale=1');
        expect(viewport).not.toMatch(/maximum-scale|user-scalable/);
    } finally { await f.window.happyDOM.close(); }
});

test('mobile inspector, code tools and attachment targets share the phone breakpoint without changing desktop', async () => {
    for (const [width, touchPoints, mobile] of [[390, 5, true], [844, 5, true], [1280, 0, false]] as const) {
        const f = await fixture(width, touchPoints);
        try {
            f.window.document.querySelector('[data-mobile-inspector-open]')!.setAttribute('data-inspector-ready', '');
            f.window.document.querySelector('.assistant')!.insertAdjacentHTML('beforeend', '<div class="mobile-code-tools"><button>Копировать</button></div><pre data-mobile-code data-mobile-collapsed="true"><code>const x = 1;</code></pre>');
            f.window.document.querySelector('#form')!.insertAdjacentHTML('beforeend', '<div class="chat-attachment-card"><span class="chat-attachment-size">10 KB</span><button class="chat-attachment-remove">×</button></div>');
            f.window.document.body.insertAdjacentHTML('beforeend', '<dialog open data-mobile-inspector-dialog><aside class="agent-meta-panel agent-meta-collapsed"><header data-mobile-inspector-header><button data-mobile-inspector-close>Назад</button></header><header data-desktop-inspector-header>Desktop</header><div data-agent-meta-content><details open><summary><span class="truncate text-xs">Настройки</span></summary></details></div></aside></dialog>');
            expect(f.css('[data-mobile-inspector-open]').display).toBe(mobile ? 'inline-flex' : 'none');
            expect(f.css('.mobile-code-tools').display).toBe(mobile ? 'flex' : 'none');
            expect(f.css('.chat-attachment-size').display).toBe(mobile ? 'block' : 'none');
            if (mobile) {
                expect(f.css('[data-mobile-inspector-dialog]').position).toBe('fixed');
                expect(f.css('[data-mobile-inspector-dialog] [data-agent-meta-content]').display).toBe('block');
                expect(f.css('[data-mobile-inspector-dialog] [data-desktop-inspector-header]').display).toBe('none');
                expect(f.css('[data-mobile-inspector-dialog] summary > .truncate').fontSize).toBe('16px');
                expect(f.css('[data-mobile-inspector-close]').minHeight).toBe('44px');
                expect(f.css('pre[data-mobile-code]').whiteSpace).toBe('pre');
                expect(f.css('pre[data-mobile-code]').fontSize).toBe('14px');
                expect(f.css('pre[data-mobile-code]').maxHeight).toBe('288px');
                expect(f.css('.chat-attachment-remove').minWidth).toBe('44px');
            } else {
                expect(f.css('[data-mobile-inspector-header]').display).toBe('none');
                expect(f.css('pre[data-mobile-code]').maxHeight).not.toBe('288px');
            }
        } finally { await f.window.happyDOM.close(); }
    }
});


test('message action trigger is outside flex flow and below the bubble on phones only', async () => {
    for (const [width, touchPoints, mobile] of [[390, 5, true], [844, 5, true], [1280, 0, false]] as const) {
        const f = await fixture(width, touchPoints);
        try {
            f.window.document.querySelector('#messages')!.insertAdjacentHTML('beforeend', '<div id="m-99" class="mobile-message-enhanced"><div class="chat-glass-primary">My text</div><button data-mobile-message-actions>⋯</button></div>');
            expect(f.css('[data-mobile-message-actions]').display).toBe(mobile ? 'block' : 'none');
            if (mobile) {
                expect(f.css('[data-mobile-message-actions]').position).toBe('absolute');
                expect(f.css('[data-mobile-message-actions]').right).toBe('0px');
                expect(f.css('[data-mobile-message-actions]').bottom).toBe('0px');
                expect(f.css('[data-mobile-message-actions]').width).toBe('44px');
                expect(f.css('#m-99').paddingBottom).toBe('44px');
            }
        } finally { await f.window.happyDOM.close(); }
    }
});


test('mobile Canvas and search are fullscreen with safe input/action sizes, retry is always explicit', async () => {
    for (const [width, touchPoints, mobile] of [[390, 5, true], [844, 5, true], [1280, 0, false]] as const) {
        const f = await fixture(width, touchPoints);
        try {
            const page = f.window.document.querySelector('[data-page="agent"]')!;
            page.setAttribute('data-canvas-open', '');
            page.insertAdjacentHTML('afterbegin', '<section class="canvas-panel"><header><button class="canvas-mobile-back">В чат</button><select class="canvas-mobile-tabs"><option>Tab</option></select><nav data-canvas-tabs>Desktop tabs</nav></header></section>');
            f.window.document.body.insertAdjacentHTML('beforeend', '<dialog open class="chat-search-dialog"><input type="search"><article class="chat-search-detail">Result</article><button>Найти</button></dialog>');
            expect(f.css('.canvas-mobile-back').display).toBe(mobile ? 'inline-flex' : 'none');
            if (mobile) {
                expect(f.css('.canvas-panel').position).toBe('fixed');
                expect(f.css('.canvas-panel').marginTop).toBe('0px');
                expect(f.css('.canvas-mobile-tabs').fontSize).toBe('16px');
                expect(f.css('.canvas-mobile-tabs').minHeight).toBe('44px');
                expect(f.css('.chat-search-dialog').position).toBe('fixed');
                expect(f.css('.chat-search-detail').fontSize).toBe('17px');
                expect(f.css('.chat-search-dialog input').fontSize).toBe('16px');
            }
            expect(f.css('[data-chat-send-error]').display).toBe('none');
            expect(f.css('[data-chat-retry]').minHeight).toBe('44px');
            expect(f.css('[data-chat-cancel-retry]').minHeight).toBe('44px');
        } finally { await f.window.happyDOM.close(); }
    }
});


test('busy composer shows send for content and always retains stop on phone, landscape and desktop', async () => {
    for (const [width, touch] of [[320, 5], [390, 5], [844, 5], [1280, 0]]) {
        const f = await fixture(width, touch, '<span data-composer-running-controls><button type="button" aria-label="Stop generation">Stop</button><button type="submit" data-composer-send>Send</button></span>');
        try {
            const update = (hasContent: boolean) => {
                const form = f.window.document.querySelector('#form')!;
                form.setAttribute('data-composer-send-ready', '');
                form.toggleAttribute('data-composer-has-content', hasContent);
                form.replaceWith(form.cloneNode(true));
            };
            update(false);
            expect(f.css('[data-composer-send]').display).toBe('none');
            expect(f.css('[aria-label="Stop generation"]').display).not.toBe('none');
            update(true);
            expect(f.css('[data-composer-send]').display).not.toBe('none');
            expect(f.css('[aria-label="Stop generation"]').display).not.toBe('none');
            expect(f.css('[data-composer-running-controls]').display).toBe('inline-flex');
            expect(f.css('[data-composer-running-controls]').gap).toBe('.25rem');
            update(false);
            expect(f.css('[data-composer-send]').display).toBe('none');
        } finally { await f.window.happyDOM.close(); }
    }
});

test('chat and menu press feedback has visible state, restrained release and reduced-motion alternative', async () => {
    const f = await fixture(390, 5);
    try {
        expect(f.html).toContain('/ui/pressFeedback.js');
        const button = f.window.document.querySelector('[data-composer-send]')!;
        button.setAttribute('data-ui-pressed', '');
        // happy-dom does not expose the independent CSS scale property.
        expect(f.styles).toContain('scale: .96;');
        expect(f.window.getComputedStyle(button).filter).toBe('brightness(.92)');
        const row = f.window.document.querySelector('.nav-row')!;
        row.setAttribute('data-ui-pressed', '');
        expect(f.styles).toContain('.home-dashboard a)[data-ui-pressed] { scale: .99; }');
        expect(f.styles).toContain('scale 180ms cubic-bezier(.2,.8,.2,1)');
        expect(f.styles).toContain('[data-ui-pressed] { scale: none !important; transform: none !important; }');
        expect(f.styles).toContain('#chat-panel .chat-composer .chat-box[data-ui-pressed]');
        expect(f.styles).toContain('transition: border-color 160ms ease, box-shadow 180ms ease');
        expect(f.styles).toContain('transition-duration: 0ms !important');
    } finally { await f.window.happyDOM.close(); }
});

test('tool popup keeps full-width Close below its scroll body on mobile only', async () => {
    for (const width of [390, 1280]) {
        const f = await fixture(width, width < 1024 ? 5 : 0);
        try {
            const popup = f.window.document.createElement('dialog'); popup.id = 'app-popup'; popup.dataset.popupKind = 'tool';
            popup.innerHTML = '<div><header><button id="app-popup-close">X</button></header><div id="app-popup-body">Tool result</div><footer data-tool-popup-footer><button data-tool-popup-close>Закрыть</button></footer></div>';
            f.window.document.body.append(popup);
            expect(f.css('[data-tool-popup-footer]').display).toBe(width === 390 ? 'block' : 'none');
            if (width === 390) {
                expect(f.css('#app-popup-close').display).toBe('none');
                expect(f.css('#app-popup').position).toBe('fixed');
                expect(f.css('#app-popup').height).toBe('auto');
                expect(f.styles).toContain('border-radius: 1rem;');
                expect(f.styles).toContain('translate: 0 -50%');
                expect(f.styles).toContain('max-height: min(85dvh, calc(var(--chat-viewport-height, 100dvh) - 1rem))');
                expect(f.css('#app-popup-body').overflow).toBe('auto');
                expect(f.css('[data-tool-popup-close]').minHeight).toBe('48px');
                const other = popup.cloneNode(true) as HTMLElement;
                popup.remove(); other.dataset.popupKind = 'secure-input';
                f.window.document.body.append(other);
                expect(f.css('[data-tool-popup-footer]').display).toBe('none');
            }
        } finally { await f.window.happyDOM.close(); }
    }
});
