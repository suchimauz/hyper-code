import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import render from './renderChrome';
import button from '../procs/ui/button';
import popup from '../ui/popup';

// Presentation-only: never read a user's conversations or change personal tabs.
const ctx: any = { fns: {
    procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text), attr: () => '' } },
    chat: { icon: () => '<span class="chat-icon" aria-hidden="true"></span>' },
    ui: {},
} };
ctx.fns.procs.ui.button = (opts: Parameters<typeof button>[2]) => button(ctx, null, opts);
ctx.fns.ui.popup = (opts: Parameters<typeof popup>[2]) => popup(ctx, null, opts);
const source = await Bun.file(new URL('../ui/layout.ts', import.meta.url)).text();
const rule = (selector: string) => source.slice(source.indexOf(selector + ' {')).split('}')[0]!;

describe('wrapped desktop project tabs', () => {
    test('wraps without a scroll container or clipping menus; tools stay at the first row', () => {
        expect(rule('.project-tab-list')).toContain('flex-wrap:wrap');
        expect(rule('.project-tab-list')).toContain('flex:1');
        expect(rule('.project-tab-list')).toContain('min-width:0');
        expect(rule('.project-tab-list')).toContain('overflow:visible');
        expect(rule('.project-tab-list')).not.toContain('overflow-x:auto');
        expect(rule('.project-tab')).toContain('flex:1 1 180px');
        expect(rule('.project-tab')).toContain('max-width:min(100%,260px)');
        expect(rule('.project-tab')).toContain('min-width:0');
        expect(rule('.project-tab-tools')).toContain('flex-shrink:0');
        expect(rule('.project-tab-tools')).toContain('align-self:flex-start');
        expect(rule('.project-title')).toMatch(/text-overflow:\s*ellipsis/);
        expect(rule('.project-menu')).toContain('position:fixed');
        expect(source).toContain('#project-tabs-host .project-tabs { display: none; }');
    });

    test.each([0, 1, 11, 30])('%i open chats preserve ordered links, selected state, full titles and separate actions', async (count) => {
        const chats = Array.from({ length: count }, (_, i) => ({
            id: `chat-${i}`, title: `${i} — Очень длинное название чата <с деталями>`.repeat(3), runState: 'idle',
        }));
        const ordered = [...chats].reverse();
        const activeId = ordered.at(-1)?.id;
        const { tabs } = await render(ctx, null, {
            projects: [{ id: 'p', title: 'Project', dir: '/work', host: '' }],
            projectId: 'p', activeId, chats, tabIds: [...ordered.map(c => c.id), 'missing'],
        });
        const w = new Window();
        try {
            w.document.body.innerHTML = tabs;
            const desktop = w.document.querySelector('.project-tabs')!;
            const links = [...desktop.querySelectorAll('.project-tab-link')];
            expect(links.map(a => a.getAttribute('href'))).toEqual(ordered.map(c => '/agent/' + c.id));
            expect(links.map(a => a.getAttribute('title'))).toEqual(ordered.map(c => c.title));
            expect(links.every(a => a.getAttribute('hx-target') === '#main')).toBe(true);
            expect(desktop.querySelectorAll('.project-tab.selected')).toHaveLength(count ? 1 : 0);
            if (count) expect(desktop.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/agent/' + activeId);
            expect([...desktop.querySelectorAll('.project-close')].map(b => b.getAttribute('data-chat-id'))).toEqual(ordered.map(c => c.id));
            expect(desktop.querySelectorAll('details.project-tab-menu summary')).toHaveLength(count);
            expect(desktop.querySelectorAll('[data-project-action="archive"]')).toHaveLength(count);
            expect(desktop.querySelector('.project-tab-tools [hx-popup="ui.newAgentPopup"]')).not.toBeNull();
            expect(desktop.querySelector('a[title="All project chats"]')).not.toBeNull();
            expect([...w.document.querySelectorAll('.project-mobile-menu a')].map(a => a.getAttribute('href'))).toEqual(links.map(a => a.getAttribute('href')));
        } finally { await w.happyDOM.close(); }
    });
});
