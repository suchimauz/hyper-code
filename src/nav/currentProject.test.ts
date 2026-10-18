import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from '../ui/navMenu';

const flush = () => new Promise(resolve => setTimeout(resolve, 10));
function setup() {
    const window = new Window({ url: 'http://localhost/agent/a' });
    window.document.body.innerHTML = '<main id="main"><section id="chat-panel" data-agent-id="a"></section></main>' + navMenu({} as any, null, {});
    window.document.body.dataset.agentId = 'stale';
    window.document.querySelector('#nav-results')!.innerHTML = '<a class="nav-row" data-nav-id="project:pA" href="/projects/view?projectId=pA">A</a><a class="nav-row" data-nav-id="project:pB" href="/projects/view?projectId=pB">B</a><button class="nav-row" data-nav-default>New agent</button>';
    const calls: string[] = [];
    window.fetch = (async (url: string) => {
        calls.push(url);
        const id = url.includes('agentId=b') ? 'pB' : 'pA';
        return { ok: true, json: async () => ({ tabs: '<div class="project-tabs" data-project-id="' + id + '"></div>' }) };
    }) as any;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.eval(window.document.querySelector('script')!.textContent!);
    return { window, calls, selected: () => window.document.querySelector('[aria-current="page"]')?.getAttribute('data-nav-id') };
}

test('menu resolves actual chat after A to B HTMX navigation, never stale body or sidebar', async () => {
    const { window, calls, selected } = setup();
    (window as any).__navOpen(); await flush();
    expect(selected()).toBe('project:pA');
    window.history.pushState({}, '', '/agent/b');
    window.document.querySelector('#chat-panel')!.setAttribute('data-agent-id', 'b');
    window.document.dispatchEvent(new window.CustomEvent('htmx:after:swap', { detail: { ctx: { target: window.document.querySelector('#main') } } }));
    await flush();
    expect(selected()).toBe('project:pB');
    expect(calls).toEqual(['/projects/navigation?agentId=a', '/projects/navigation?agentId=b']);
    await window.happyDOM.close();
});

test('project list URL uses matching live page and does not infer from stale chat', async () => {
    const { window, calls, selected } = setup();
    window.history.pushState({}, '', '/projects/view?projectId=pB&list=1');
    window.document.querySelector('#main')!.innerHTML = '<section class="project-page" data-project-id="pB"></section>';
    (window as any).__navOpen(); await flush();
    expect(selected()).toBe('project:pB');
    expect(calls).toEqual([]);
    await window.happyDOM.close();
});

test('mismatched swapped chat clears current project; Enter activates popup button', async () => {
    const { window, calls, selected } = setup();
    window.history.pushState({}, '', '/agent/b');
    let clicks = 0;
    window.document.querySelector('button[data-nav-default]')!.addEventListener('click', () => clicks++);
    (window as any).__navOpen(); await flush();
    expect(selected()).toBeUndefined();
    expect(calls).toEqual([]);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(clicks).toBe(1);
    await window.happyDOM.close();
});
