import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from './navMenu';
import home from '../nav/home';

async function render(source = 'default', tab = 'home', edit = false) {
    const ctx = {
        state: { nav: { widgets: {} } },
        fns: { procs: { ui: { escape: ({ text }: { text: string }) => text } }, nav: {
            tabs: async () => ({ source, tabs: [{ id: tab, title: tab, widgets: ['projects', 'chats', 'pages'].map(widget => ({ id: widget, widget })) }] }),
            drawWidget: async () => '<a class="nav-row" href="/">row</a>',
        } },
    } as unknown as Context;
    return home(ctx, null, { tab, edit });
}

function setup(width = 390, touch = true) {
    const window = new Window({ url: 'http://localhost/files', width });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touch ? 5 : 0 });
    window.document.body.innerHTML = navMenu({} as Context, null, {});
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.eval(window.document.querySelector('script')!.textContent!);
    const client = window as typeof window & { __navOpen(): void };
    const results = window.document.getElementById('nav-results')!;
    const refresh = (html: string) => {
        results.innerHTML = html;
        window.document.dispatchEvent(new window.CustomEvent('htmx:after:swap', { detail: { target: results } }));
    };
    const resize = (width: number) => { window.happyDOM.setWindowSize({ width }); window.dispatchEvent(new window.Event('resize')); };
    const order = () => Array.from(results.querySelectorAll('[data-widget-type]')).map(el => el.getAttribute('data-widget-type'));
    return { window, client, results, refresh, resize, order };
}

const grid = `<div data-nav-mobile-chats-first><section data-widget-type="projects" data-nav-widget="projects"><a class="nav-row" data-nav-id="projects">Projects</a></section><!-- original separator --><section data-widget-type="chats" data-nav-widget="chats"><form><input value="draft"></form><a class="nav-row" data-nav-id="chats">Chats</a></section><section data-widget-type="pages" data-nav-widget="pages"><a class="nav-row" data-nav-id="pages">Pages</a></section></div>`;

describe('mobile default Home widget order', () => {
    test('server opts in only uncustomized default Home outside edit mode', async () => {
        expect(await render()).toContain('data-nav-mobile-chats-first');
        for (const args of [['user', 'home', false], ['instance', 'home', false], ['default', 'plugins', false], ['default', 'home', true]] as const) {
            expect(await render(...args)).not.toContain('data-nav-mobile-chats-first');
        }
    });

    test('moves existing nodes, restores exact original child order, and survives refresh', async () => {
        const f = setup(1280, false);
        try {
            f.refresh(grid);
            const body = f.results.firstElementChild!;
            const original = [...body.childNodes];
            const chats = body.querySelector('[data-widget-type="chats"]')!;
            const input = chats.querySelector('input')!;
            input.value = 'unsaved';
            f.resize(700);
            expect(f.order()).toEqual(['chats', 'projects', 'pages']);
            expect(body.firstElementChild).toBe(chats);
            expect(f.results.querySelectorAll('form').length).toBe(1);
            expect(input.value).toBe('unsaved');
            f.resize(701);
            expect([...body.childNodes]).toEqual(original);
            f.resize(390);
            f.refresh(grid);
            expect(f.order()).toEqual(['chats', 'projects', 'pages']);
            f.resize(1280);
            expect(f.order()).toEqual(['projects', 'chats', 'pages']);
        } finally { await f.window.happyDOM.close(); }
    });

    test('coarse tablets use chats first through 1023px, desktop and custom grids retain order', async () => {
        const f = setup(1023);
        try {
            f.refresh(grid);
            expect(f.order()).toEqual(['chats', 'projects', 'pages']);
            f.resize(1024);
            expect(f.order()).toEqual(['projects', 'chats', 'pages']);
            f.resize(844);
            expect(f.order()).toEqual(['chats', 'projects', 'pages']);
            f.refresh(grid.replace('data-nav-mobile-chats-first', 'data-custom'));
            expect(f.order()).toEqual(['projects', 'chats', 'pages']);
            f.refresh('<a class="nav-row">Search result</a>');
            expect(f.results.textContent).toBe('Search result');
        } finally { await f.window.happyDOM.close(); }
    });

    test('keyboard traversal follows moved DOM order and resize preserves selected row', async () => {
        const f = setup();
        try {
            f.refresh(grid); f.client.__navOpen();
            const key = (key: string) => f.window.dispatchEvent(new f.window.KeyboardEvent('keydown', { key }));
            key('ArrowDown');
            expect((f.window as any).__navSelId).toBe('chats');
            f.resize(1280);
            expect((f.window as any).__navSelId).toBe('chats');
            key('ArrowDown');
            expect((f.window as any).__navSelId).toBe('pages');
        } finally { await f.window.happyDOM.close(); }
    });
});

test('mobile menu shows seven agent rows with reversible expansion; desktop and search keep all rows',async()=>{
 const f=setup();
 const agents=Array.from({length:10},(_,i)=>`<div class="group flex"><a class="nav-row" data-nav-id="agent:a${i}" href="/agent/a${i}">Chat ${i}</a></div>`).join('');
 const html=`<section data-widget-type="chats" data-nav-widget="recent"><a class="nav-row" data-nav-default>New agent</a><section><h4>Recent</h4>${agents}</section></section>`;
 const visible=()=>[...f.results.querySelectorAll('[data-nav-id^="agent:"]')].filter(row=>!row.closest('[hidden]'));
 try{
  f.refresh(html);expect(visible()).toHaveLength(7);
  let more=f.results.querySelector('[data-nav-more-chats]') as any;
  expect(more.textContent).toBe('Показать ещё · 3');expect(more.getAttribute('aria-expanded')).toBe('false');
  more.click();expect(visible()).toHaveLength(10);expect(more.textContent).toBe('Свернуть');
  f.refresh(html);expect(visible()).toHaveLength(10);
  more=f.results.querySelector('[data-nav-more-chats]');more.click();expect(visible()).toHaveLength(7);
  f.resize(1280);expect(visible()).toHaveLength(10);expect(f.results.querySelector('[data-nav-more-chats]')).toBeNull();
  f.resize(390);expect(visible()).toHaveLength(7);
  f.refresh(agents);expect(visible()).toHaveLength(10);expect(f.results.querySelector('[data-nav-more-chats]')).toBeNull();
  f.refresh(html.replace(agents,agents.split('</div>').slice(0,4).join('</div>')));expect(f.results.querySelector('[data-nav-more-chats]')).toBeNull();
 }finally{await f.window.happyDOM.close();}
});
