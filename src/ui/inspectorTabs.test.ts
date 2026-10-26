import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx();
const script = await Bun.file(new URL('./$script_meta.js', import.meta.url)).text();
const agent = { id: 'tabs', scratchpad: { plan: { title: 'Plan', tasks: [{ id: 'task', title: 'Review', instructions: 'Check the result', status: 'pending' }] } } };
function fixture(id = 'tabs') {
    const w = new Window();
    w.document.body.innerHTML = ctx.fns.ui.agentMetaPanel({ agent: { ...agent, id } });
    let subscription: any;
    const requests: any[] = [];
    (w as any).htmx = { ajax: (...args: any[]) => { requests.push(args); return Promise.resolve(); } };
    (w as any).hyperLive = { subscribe: (s: any) => { subscription = s; } };
    (w as any).fetch = () => Promise.resolve();
    w.eval(script);
    const tab = (key: string): any => w.document.querySelector(`[data-agent-inspector-tab="${key}"]`);
    const pane = (key: string): any => w.document.querySelector(`[data-agent-inspector-pane="${key}"]`);
    return { w, tab, pane, requests, subscription };
}

test('tabs expose a single selected tab and correct permanent section groups', () => {
    const { w, tab, pane } = fixture();
    for (const [key, sections] of Object.entries({ work: ['plan', 'team', 'automation'], context: ['goal', 'knowledge'], settings: ['settings', 'compaction'] })) {
        expect([...pane(key).querySelectorAll('[data-meta-section]')].map((el: any) => el.dataset.metaSection)).toEqual(sections);
        expect(tab(key).getAttribute('aria-controls')).toBe(pane(key).id);
        expect(pane(key).getAttribute('aria-labelledby')).toBe(tab(key).id);
        expect(tab(key).tabIndex).toBe(key === 'work' ? 0 : -1);
        expect(pane(key).hidden).toBe(key !== 'work');
    }
    expect(w.document.querySelectorAll('[role=tab][aria-selected=true]').length).toBe(1);
    w.happyDOM.abort();
});

test('arrow, Home and End keys move selection and focus with wrapping', () => {
    const { w, tab } = fixture();
    tab('work').focus();
    const press = (key: string) => w.document.activeElement!.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    for (const [key, selected] of [['ArrowLeft','settings'], ['ArrowRight','work'], ['End','settings'], ['Home','work'], ['ArrowRight','context']]) {
        press(key);
        expect(w.document.activeElement).toBe(tab(selected));
        expect(tab(selected).getAttribute('aria-selected')).toBe('true');
    }
    w.happyDOM.abort();
});

test('switching, collapse and independent live refresh retain form nodes, disclosure and scroll', async () => {
    const { w, tab, pane, requests, subscription } = fixture();
    const scroll: any = w.document.querySelector('[data-agent-meta-content]');
    const input: any = w.document.querySelector('[name=task_title]');
    const editor: any = input.closest('details');
    editor.open = true; input.value = 'Unsaved review';
    scroll.scrollTop = 85;
    tab('context').click(); expect(scroll.scrollTop).toBe(0);
    scroll.scrollTop = 31;
    tab('work').click(); expect(scroll.scrollTop).toBe(85);
    expect(w.document.querySelector('[name=task_title]')).toBe(input);
    expect(input.value).toBe('Unsaved review'); expect(editor.open).toBe(true);
    tab('settings').click();
    const toggle: any = w.document.querySelector('[data-agent-meta-toggle]'); toggle.click(); toggle.click();
    subscription.onEvent({ agentId: 'tabs', section: 'plan' });
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(requests.length).toBe(1); expect(requests[0][2].swap).toBe('innerMorph');
    requests[0][2].target.dispatchEvent(new w.Event('htmx:after:process', { bubbles: true }));
    expect(pane('settings').hidden).toBe(false); expect(pane('work').hidden).toBe(true);
    expect(input.value).toBe('Unsaved review');
    tab('context').click(); expect(scroll.scrollTop).toBe(31);
    w.happyDOM.abort();
});

test('invalid hidden fields reveal the owning tab and every nested editor', () => {
    const { w, tab, pane } = fixture();
    tab('settings').click();
    const input: any = w.document.querySelector('[name=task_title]');
    input.value = ''; input.dispatchEvent(new w.Event('invalid'));
    expect(pane('work').hidden).toBe(false);
    expect(input.closest('details').open).toBe(true);
    expect(input.closest('[data-plan-task]').open).toBe(true);
    w.happyDOM.abort();
});

test('reprocessing one slot does not reset selection and other agent panels start independently', () => {
    const { w, tab, pane } = fixture();
    tab('context').click();
    w.document.querySelector('[data-meta-section=goal]')!.dispatchEvent(new w.Event('htmx:after:process', { bubbles: true }));
    expect(pane('context').hidden).toBe(false);
    w.document.body.insertAdjacentHTML('beforeend', ctx.fns.ui.agentMetaPanel({ agent: { ...agent, id: 'other' } }));
    const other = w.document.getElementById('agent-meta-other')!;
    other.dispatchEvent(new w.Event('htmx:after:process', { bubbles: true }));
    expect(other.querySelector('[data-agent-inspector-tab=work]')!.getAttribute('aria-selected')).toBe('true');
    expect(pane('context').hidden).toBe(false);
    w.happyDOM.abort();
});
