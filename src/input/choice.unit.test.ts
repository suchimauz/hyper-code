// No live inputs: exercise the real card, POST parser, kind, submission and
// delivered user turn with in-memory persistence. Browser Enter uses the first
// submit button in tree order, even when that button says Cancel.
import { expect, test } from 'bun:test';
import { Window, type HTMLButtonElement, type HTMLInputElement } from 'happy-dom';
import { renderCtx } from '../ui/testRender.entry';
import card from './card';
import post from './$route_$id_POST';
import submit from './submit';
import choice from './$input_choice';
import confirm from './$input_confirm';
import secret from './$input_secret';

async function fixture(multiple = false) {
    const ctx = await renderCtx();
    const input: types.input.Row = {
        id: 'fixture', agentId: 'fixture-agent', kind: 'choice', state: 'open', title: 'Which?', message: '',
        spec: choice.prepare(ctx, { spec: { options: ['a', { value: 'b', label: 'Bee' }], allowOther: true, multiple } }),
        result: null, error: null, answeredBy: null, createdAt: 0, updatedAt: 0,
    };
    const messages: Array<{ role: string; content: string; message_type: string }> = [];
    let wakes = 0;
    ctx.state.input = { kinds: { choice, confirm, secret } };
    ctx.fns.input = {
        get: async () => input,
        submit: (opts: Parameters<typeof submit>[2]) => submit(ctx, null, opts),
        card: (opts: Parameters<typeof card>[2]) => card(ctx, null, opts),
    };
    ctx.fns.auth = { verifyCsrf: async ({ token }: { token: string }) => token === 'fixture' };
    ctx.fns.procs.db = {
        run: async ({ sql, params }: { sql: string; params: any[] }) => {
            if (sql.includes("state = 'processing'")) {
                if (input.state !== 'open') return { rows: [] };
                input.state = 'processing'; return { rows: [{ id: input.id }] };
            }
            if (sql.includes("state = 'open'")) input.state = 'open';
            else if (sql.includes('result = ?::jsonb')) {
                input.state = params[0]; input.result = params[1] === null ? null : JSON.parse(params[1]);
            } else if (!sql.startsWith('UPDATE agents')) throw new Error(`Unexpected SQL: ${sql}`);
            return { rows: [] };
        },
        select: async () => [],
        transaction: async ({ fn }: { fn: () => Promise<void> }) => fn(),
    };
    ctx.fns.procs.events = { refresh() {} };
    ctx.fns.session = { mutateScratchpad: async () => {}, appendMessage: async ({ message }: { message: typeof messages[number] }) => { messages.push(message); } };
    ctx.fns.agent = { wakeWorker: () => { wakes++; } };
    const window = new Window();
    const render = async () => { window.document.body.innerHTML = await card(ctx, null, { id: input.id }); };
    await render();
    const send = async (action = 'input-submit') => {
        const form = window.document.querySelector('form')!;
        const button = form.querySelector(`[data-action="${action}"]`)! as HTMLButtonElement;
        const body = new URLSearchParams();
        for (const [key, value] of new window.FormData(form)) body.append(key, String(value));
        if (button.name) body.append(button.name, button.value);
        return post(ctx, null, { params: { id: input.id }, req: new Request('http://fixture/input/fixture', {
            method: 'POST', headers: { 'x-csrf-token': 'fixture' }, body,
        }) });
    };
    return { ctx, input, window, messages, render, send, wakes: () => wakes };
}

for (const multiple of [false, true]) {
    test(`choice ${multiple ? 'multiple' : 'single'}: Enter defaults to Submit, not Cancel`, async () => {
        const f = await fixture(multiple);
        try {
            const form = f.window.document.querySelector('form')!;
            expect(form.querySelector('[type="submit"]')!.getAttribute('data-action')).toBe('input-submit');
        } finally { await f.window.happyDOM.close(); }
    });
    for (const picks of [[], ['b'], ...(multiple ? [['a', 'b']] : [])]) {
        test(`choice ${multiple ? 'multiple' : 'single'}: other with ${picks.length} picks reaches the agent exactly once`, async () => {
            const f = await fixture(multiple);
            try {
                (f.window.document.querySelector('[name="other"]')! as HTMLInputElement).value = '  Свой ответ <b>не HTML</b>  ';
                for (const value of picks) (f.window.document.querySelector(`[name="pick"][value="${value}"]`)! as HTMLInputElement).checked = true;
                const response = await f.send();
                const html = await response.text();
                const result = { ...(multiple ? { values: picks } : picks.length ? { value: picks[0] } : {}), other: 'Свой ответ <b>не HTML</b>' };
                expect(response.status).toBe(200);
                expect(f.input.state).toBe('submitted');
                expect(f.input.result).toEqual(result);
                expect(html).toContain('data-input-state="submitted"');
                expect(html).toContain('Свой ответ &lt;b&gt;не HTML&lt;/b&gt;');
                expect(f.messages).toHaveLength(1);
                expect(f.messages[0]).toMatchObject({ role: 'user', message_type: 'input' });
                expect(f.messages[0]!.content).toContain(JSON.stringify(result));
                expect(f.messages[0]!.content).toContain('other: Свой ответ');
                expect(f.wakes()).toBe(1);
                await f.send();
                expect(f.messages).toHaveLength(1);
                expect(f.wakes()).toBe(1);
            } finally { await f.window.happyDOM.close(); }
        });
    }
}

test('choice: blank other keeps the form open with an error, then a regular choice still works', async () => {
    const f = await fixture();
    try {
        (f.window.document.querySelector('[name="other"]')! as HTMLInputElement).value = '  ';
        expect(await (await f.send()).text()).toContain('Select an option or enter your own');
        expect(f.input.state).toBe('open'); expect(f.messages).toHaveLength(0); expect(f.wakes()).toBe(0);
        (f.window.document.querySelector('[value="b"]')! as HTMLInputElement).checked = true;
        await f.send();
        expect(f.input.result).toEqual({ value: 'b' }); expect(f.messages).toHaveLength(1);
    } finally { await f.window.happyDOM.close(); }
});

test('choice: explicit Cancel still cancels and never delivers the draft as an answer', async () => {
    const f = await fixture();
    try {
        (f.window.document.querySelector('[name="other"]')! as HTMLInputElement).value = 'unsent draft';
        expect(f.window.document.querySelector('[data-action="input-cancel"]')!.hasAttribute('formnovalidate')).toBe(true);
        await f.send('input-cancel');
        expect(f.input.state).toBe('cancelled'); expect(f.input.result).toBeNull();
        expect(f.messages).toHaveLength(1);
        expect(f.messages[0]!.content).toContain('state="cancelled"');
        expect(f.messages[0]!.content).not.toContain('unsent draft');
    } finally { await f.window.happyDOM.close(); }
});

test('default secret form submits first; custom confirmation retains its safe Decline default', async () => {
    const f = await fixture();
    try {
        f.input.kind = 'secret'; f.input.spec = { mode: 'text', maxlength: 256, saveAs: 'secret://test/example' };
        await f.render();
        expect(f.window.document.querySelector('[type="submit"]')!.getAttribute('data-action')).toBe('input-submit');
        f.input.kind = 'confirm'; f.input.spec = confirm.prepare(f.ctx, { spec: {} });
        await f.render();
        expect(f.window.document.querySelector('[type="submit"]')!.getAttribute('data-action')).toBe('input-decline');
        expect(f.window.document.querySelector('[data-action="input-cancel"]')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});
