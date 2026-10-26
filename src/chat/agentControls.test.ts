import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import panel from './panel';
import renderRows from './renderCardRows';
import header from './header';

const escape = ({ text }: { text: unknown }) => Bun.escapeHTML(String(text));
const popup = ({ method, html, attrs }: { method: string; html: string; attrs: string }) => `<button type="button" hx-popup="${method}" ${attrs}>${html}</button>`;

function fixture() {
    const a = { id: 'a1', title: '<unsafe>', model: 'test:echo', workspaceDir: '/tmp/project' };
    const cards = [
        { id: 'appearance', title: 'Settings', render: () => [{ label: 'Model', popup: { method: 'agent.modelPicker' } }] },
        { id: 'agent.context', title: 'Context', icon: 'ph-stack', render: () => [{ label: 'Compact', popup: { method: 'chat.compactPopup' } }] },
        { id: 'plugin.extra', title: 'Plugin', size: 'L', render: () => ({ html: '<p>Plugin content</p>', rows: [{ label: 'Docs', href: '/docs' }] }) },
        { id: 'danger', title: 'Danger', render: () => [{ label: 'Delete', post: '/agent/a1/delete', confirm: 'Delete "a1"?', tone: 'danger' }] },
    ];
    const ctx = { fns: {
        procs: { ui: { escape } },
        ui: { popup, inplacePopup: async ({ triggerAttrs, panelAttrs }: any) => `<button ${triggerAttrs}>More</button><div ${panelAttrs}></div>` },
        chat: {
            icon: () => '<svg data-avatar></svg>',
            buildRenderContext: async () => ({ agent: a }),
            listParts: async () => cards,
            renderParts: async () => [],
            withTimeout: async ({ run }: any) => run(),
            renderCardRows: (opts: any) => renderRows(ctx as unknown as Context, null, opts),
        },
    } } as unknown as Context;
    return { ctx, a, cards };
}

test('agent menu preserves plugin content, registered order, confirmations and workspace controls', async () => {
    const { ctx } = fixture();
    const html = await panel(ctx, null, { agentId: 'a1' });
    const w = new Window();
    try {
        w.document.body.innerHTML = html;
        const doc = w.document;
        expect(doc.querySelectorAll('[hx-popup="chat.iconPopup"]')).toHaveLength(1);
        expect(doc.querySelectorAll('[hx-popup="chat.renamePopup"]')).toHaveLength(1);
        expect(doc.querySelector('.chat-panel-name')?.textContent).toBe('<unsafe>');
        expect(doc.querySelector('unsafe')).toBeNull();
        expect(doc.querySelector('[data-chat-technical-id]')?.textContent).toBe('ID a1');
        expect(doc.querySelector('[data-chat-technical-id]')?.getAttribute('aria-label')).toBe('ID агента a1');
        expect(doc.querySelector('[data-canvas-toggle]')?.getAttribute('data-canvas-toggle')).toBe('open');
        expect(doc.querySelector('[data-mobile-inspector-open]')?.getAttribute('aria-controls')).toBe('agent-meta-a1');
        expect(doc.querySelector('[data-chat-search]')?.getAttribute('data-chat-search')).toBe('a1');
        expect([...doc.querySelectorAll('[data-chat-id]')].map(n => n.getAttribute('data-chat-id'))).toEqual(['appearance', 'agent.context', 'plugin.extra', 'danger']);
        expect(doc.querySelector('[data-chat-id="agent.context"]')?.tagName).toBe('DETAILS');
        expect(doc.querySelector('[data-chat-id="agent.context"]')?.hasAttribute('open')).toBe(false);
        expect(doc.querySelector('[data-chat-id="plugin.extra"]')?.textContent).toContain('Plugin content');
        expect(doc.querySelector('[data-chat-id="plugin.extra"] a')?.getAttribute('href')).toBe('/docs');
        expect(doc.querySelector('form')?.getAttribute('action')).toBe('/agent/a1/delete');
        expect(doc.querySelector('form')?.getAttribute('onsubmit')).toBe('return confirm("Delete \\"a1\\"?")');
    } finally { await w.happyDOM.close(); }
});

test('toolbar avatar edits identity, not the model, and keeps its technical ID visible', async () => {
    const { ctx, a } = fixture();
    const html = await header(ctx, null, { context: { agent: a } as any });
    expect(html).toContain('hx-popup="chat.iconPopup"');
    expect(html).toContain('hx-popup="chat.renamePopup"');
    expect(html).not.toContain('agent.modelPicker');
    expect(html).toContain('data-chat-technical-id');
    expect(html).toContain('aria-label="ID агента a1"');
    expect(html).toContain('class="chat-header-meta"');
    expect(html).not.toContain('data-chat-model-mark');
    expect(html).toContain('data-chat-menu-trigger');
    expect(html).toContain('aria-controls="agent-meta-a1"');
    expect(html).toContain('>Инспектор</span>');
    expect(html).toContain('&lt;unsafe&gt;');
});

test('lazy management menu loads fresh controls, syncs its trigger and closes before workspace actions', async () => {
    const w = new Window({ settings: { enableJavaScriptEvaluation: true } });
    const doc = w.document;
    let fetches = 0;
    try {
        doc.body.innerHTML = '<button popovertarget="p" data-chat-menu-trigger aria-expanded="false">Menu</button><div id="p" data-chat-panel="/chat/a1/panel"><div data-chat-panel-body></div></div>';
        const p = doc.querySelector('#p')! as any;
        const toggle = (newState: string) => { const event = new w.Event('toggle'); Object.defineProperty(event, 'newState', { value: newState }); p.dispatchEvent(event); };
        p.hidePopover = () => toggle('closed');
        (w as any).fetch = async () => { fetches++; return { ok: true, text: async () => '<button data-chat-panel-close>Close</button><button data-mobile-inspector-open>Inspector</button><button hx-popup="chat.iconPopup">Icon</button><button data-canvas-toggle="open">Canvas</button>' }; };
        w.eval(await Bun.file(new URL('./$script_header.js', import.meta.url)).text());
        for (const selector of ['[data-mobile-inspector-open]', '[hx-popup]', '[data-canvas-toggle]', '[data-chat-panel-close]']) {
            toggle('open');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(doc.querySelector('[data-chat-menu-trigger]')?.getAttribute('aria-expanded')).toBe('true');
            (doc.querySelector(selector) as any).click();
            expect(doc.querySelector('[data-chat-menu-trigger]')?.getAttribute('aria-expanded')).toBe('false');
        }
        expect(fetches).toBe(4);
        expect(doc.activeElement).toBe(doc.querySelector('[data-chat-menu-trigger]'));
    } finally { await w.happyDOM.close(); }
});
