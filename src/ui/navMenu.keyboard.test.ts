import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from './navMenu';

function setup({ project = false, nested = false } = {}) {
    const window = new Window({ url: project ? 'http://localhost/projects/view?projectId=p1' : 'http://localhost/files', width: 1200 });
    const document = window.document;
    const shell = `<main id="main"><button id="opener">Menu</button>${project ? '<div class="project-page" data-project-id="p1"></div>' : ''}</main><aside id="already-inert" inert>Unavailable</aside>`;
    document.body.innerHTML = shell + (nested ? '<div id="shell"><button id="sibling">Background</button>' : '') + navMenu({} as Context, null, {}) + (nested ? '</div>' : '');
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.eval(document.querySelector('script')!.textContent!);
    const client = window as typeof window & { __navOpen(): void; __navClose(): void; __navIsOpen(): boolean };
    const results = document.getElementById('nav-results')!;
    const query = document.getElementById('nav-q')! as HTMLInputElement;
    const opener = document.getElementById('opener')!;
    const refresh = (html: string) => {
        results.innerHTML = html;
        document.dispatchEvent(new window.CustomEvent('htmx:after:swap', { detail: { target: results } }));
    };
    const key = (target: Element, name: string, shiftKey = false) => {
        const event = new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, shiftKey });
        target.dispatchEvent(event);
        return event;
    };
    refresh('<a class="nav-row" data-nav-id="project:p1" data-nav-default href="#one">One</a><a class="nav-row" data-nav-id="page:two" href="#two">Two</a>');
    opener.focus();
    client.__navOpen();
    return { window, document, client, results, query, opener, refresh, key };
}

describe('navigation menu keyboard accessibility', () => {
    test('Enter on focused links, buttons, tabs and summary keeps native activation', async () => {
        const f = setup();
        try {
            f.results.insertAdjacentHTML('beforeend', '<button id="ordinary" type="button">Action</button><button id="tab" role="tab" data-nav-tab="other">Other tab</button><details><summary id="summary">More</summary></details><a id="plain" href="#plain">Plain link</a>');
            // happy-dom does not synthesize native Enter clicks: defaultPrevented is the contract here.
            for (const element of [f.results.querySelector('.nav-row')!, ...['ordinary', 'tab', 'summary', 'plain', 'nav-close', 'nav-theme-toggle'].map(id => f.document.getElementById(id)!)]) {
                (element as HTMLElement).focus();
                expect(f.key(element, 'Enter').defaultPrevented).toBe(false);
                expect(f.document.activeElement).toBe(element);
                expect(f.window.location.hash).toBe('');
                expect(f.client.__navIsOpen()).toBe(true);
            }
        } finally { await f.window.happyDOM.close(); }
    });

    test('Enter in search activates the selected row, not an unrelated control', async () => {
        const f = setup();
        try {
            f.refresh('<button class="nav-row" data-nav-id="action:first" data-nav-default type="button">Selected</button><button id="other" type="button">Other</button>');
            let selected = 0, other = 0;
            f.results.querySelector('.nav-row')!.addEventListener('click', () => selected++);
            f.document.getElementById('other')!.addEventListener('click', () => other++);
            f.query.focus();
            expect(f.key(f.query, 'Enter').defaultPrevented).toBe(true);
            expect(selected).toBe(1);
            expect(other).toBe(0);
        } finally { await f.window.happyDOM.close(); }
    });

    test('arrow navigation moves actual focus from search and then between rows', async () => {
        const f = setup();
        try {
            f.refresh('<a class="nav-row" href="#first">First</a><div hidden><a class="nav-row" href="#hidden">Hidden</a></div><details><summary>Closed</summary><a class="nav-row" href="#closed">Closed row</a></details><a class="nav-row" href="#last">Last</a>');
            const rows = f.results.querySelectorAll('.nav-row');
            f.query.focus();
            expect(f.key(f.query, 'ArrowDown').defaultPrevented).toBe(true);
            expect(f.document.activeElement).toBe(rows[0]);
            expect(f.key(rows[0]!, 'ArrowDown').defaultPrevented).toBe(true);
            expect(f.document.activeElement).toBe(rows[3]);
            f.key(rows[3]!, 'ArrowUp');
            expect(f.document.activeElement).toBe(rows[0]);
        } finally { await f.window.happyDOM.close(); }
    });

    test('editing controls retain Enter and arrow keys', async () => {
        const f = setup();
        try {
            f.results.insertAdjacentHTML('beforeend', '<form><input id="name"><textarea id="draft"></textarea><select id="choice"><option>One</option></select><button id="submit">Save</button></form><div id="editable" contenteditable="true" tabindex="0">Draft</div>');
            for (const id of ['name', 'draft', 'choice', 'editable', 'submit']) {
                const control = f.document.getElementById(id)!;
                control.focus();
                for (const key of ['Enter', 'ArrowUp', 'ArrowDown']) {
                    expect(f.key(control, key).defaultPrevented).toBe(false);
                    expect(f.document.activeElement).toBe(control);
                    expect(f.window.location.hash).toBe('');
                }
            }
        } finally { await f.window.happyDOM.close(); }
    });

    test('Tab remains native between controls, and wraps only at dialog boundaries', async () => {
        const f = setup();
        try {
            const last = f.results.querySelectorAll('.nav-row')[1]!;
            const first = f.document.querySelector('#nav-overlay button')!;
            const theme = f.document.getElementById('nav-theme-toggle')!;
            theme.focus();
            expect(f.key(theme, 'Tab').defaultPrevented).toBe(false);
            (first as HTMLElement).focus();
            expect(f.key(first, 'Tab', true).defaultPrevented).toBe(true);
            expect(f.document.activeElement).toBe(last);
            expect(f.key(last, 'Tab').defaultPrevented).toBe(true);
            expect(f.document.activeElement).toBe(first);
            expect(f.client.__navIsOpen()).toBe(true);
        } finally { await f.window.happyDOM.close(); }
    });

    for (const nested of [false, true]) test(`background becomes inert and restores previous state (${nested ? 'nested' : 'body'} overlay)`, async () => {
        const f = setup({ nested });
        try {
            const main = f.document.getElementById('main')!;
            const previous = f.document.getElementById('already-inert')!;
            expect(main.inert).toBe(true);
            expect(previous.inert).toBe(true);
            if (nested) {
                expect(f.document.getElementById('sibling')!.inert).toBe(true);
                expect(f.document.getElementById('shell')!.inert).toBe(false);
            }
            // Reopening must not overwrite the original focus/inert snapshot.
            f.client.__navOpen();
            f.client.__navClose();
            expect(main.inert).toBe(false);
            expect(previous.inert).toBe(true);
            if (nested) expect(f.document.getElementById('sibling')!.inert).toBe(false);
            expect(f.document.activeElement).toBe(f.opener);
            expect(f.client.__navIsOpen()).toBe(false);
        } finally { await f.window.happyDOM.close(); }
    });

    test('nested usage modal owns its Enter, Tab, arrows and Escape', async () => {
        const f = setup();
        try {
            f.results.insertAdjacentHTML('beforeend', '<dialog class="mobile-usage-dialog"><button id="modal-control">Done</button></dialog>');
            const modal = f.results.querySelector('dialog')!;
            modal.showModal();
            const control = f.document.getElementById('modal-control')!;
            control.focus();
            for (const key of ['Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'Escape']) {
                expect(f.key(control, key).defaultPrevented).toBe(false);
                expect(f.document.activeElement).toBe(control);
                expect(f.client.__navIsOpen()).toBe(true);
                expect(f.window.location.hash).toBe('');
            }
        } finally { await f.window.happyDOM.close(); }
    });

    test('plain anchors have no aria-selected while current project retains aria-current', async () => {
        const f = setup({ project: true });
        try {
            const rows = f.results.querySelectorAll('a.nav-row');
            expect(rows[0]!.getAttribute('aria-current')).toBe('page');
            f.key(f.query, 'ArrowDown');
            for (const row of rows) expect(row.hasAttribute('aria-selected')).toBe(false);
            expect(rows[0]!.getAttribute('aria-current')).toBe('page');
            expect(rows[1]!.hasAttribute('aria-current')).toBe(false);
        } finally { await f.window.happyDOM.close(); }
    });

    test('Escape clears a nonempty search before closing and restoring focus', async () => {
        const f = setup();
        try {
            f.query.value = 'needle';
            f.query.focus();
            expect(f.key(f.query, 'Escape').defaultPrevented).toBe(true);
            expect(f.query.value).toBe('');
            expect(f.client.__navIsOpen()).toBe(true);
            expect(f.document.activeElement).toBe(f.query);
            expect(f.key(f.query, 'Escape').defaultPrevented).toBe(true);
            expect(f.client.__navIsOpen()).toBe(false);
            expect(f.document.activeElement).toBe(f.opener);
        } finally { await f.window.happyDOM.close(); }
    });
});
