import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import renderStatusBar from './renderStatusBar';
import button from '../procs/ui/button';
import escape from '../procs/ui/escape';
import attr from '../procs/ui/attr';

async function render(overrides: Record<string, unknown> = {}, part: 'status' | 'stop' = 'status') {
    const row = { run_state: 'idle', run_started_at: null, last_error_idx: 123, last_processed_msg_idx: 8, last_error: '<failure>', scratchpad: '{}', next_run_at: null, ...overrides };
    const ctx: any = { fns: {
        agent: { teamActivity: async () => ({}) },
        procs: { db: { select: async ({ sql }: any) => sql.includes('FROM agents') ? [row] : [] }, ui: {} },
        ui: { live: ({ html }: any) => html },
    } };
    ctx.fns.procs.ui = { escape: (o: any) => escape(ctx, null, o), attr: (o: any) => attr(ctx, null, o), button: (o: any) => button(ctx, null, o) };
    return renderStatusBar(ctx, null, { agentId: 'a/b', part, initialUsage: {} });
}

test('failed response has explicit safe continuation button with stable idempotency and isolated payload', async () => {
    const w = new Window();
    try {
        w.document.body.innerHTML = await render();
        const b = w.document.querySelector('[data-agent-retry]')!;
        expect(b.textContent).toBe('');
        expect(b.getAttribute('aria-label')).toBe('Повторить');
        expect(b.querySelector('.ph-arrow-clockwise')).not.toBeNull();
        expect(b.getAttribute('type')).toBe('button');
        expect(b.getAttribute('hx-post')).toBe('/agent/a%2Fb');
        expect(b.getAttribute('hx-swap')).toBe('none');
        expect(b.getAttribute('hx-params')).toBe('text,requestId');
        expect(b.getAttribute('hx-disabled-elt')).toBe('this');
        expect(b.getAttribute('hx-sync')).toBe('this:drop');
        expect(b.hasAttribute('hx-trigger')).toBe(false);
        const values = JSON.parse(b.getAttribute('hx-vals')!);
        expect(Object.keys(values).sort()).toEqual(['requestId', 'text']);
        expect(values.text).toBe('Continue from where you stopped after the error. Do not repeat actions that have already completed.');
        expect(values.requestId).toStartWith('retry-response-');
        w.document.body.innerHTML = await render();
        expect(JSON.parse(w.document.querySelector('[data-agent-retry]')!.getAttribute('hx-vals')!).requestId).toBe(values.requestId);
        w.document.body.innerHTML = await render({ last_error_idx: 456 });
        expect(JSON.parse(w.document.querySelector('[data-agent-retry]')!.getAttribute('hx-vals')!).requestId).not.toBe(values.requestId);
    } finally { await w.happyDOM.close(); }
});

for (const [name, row] of Object.entries({
    healthy: { last_error: null }, running: { run_state: 'running' }, queued: { next_run_at: 42 },
    parked: { scratchpad: JSON.stringify({ parked: { message: 'quota' } }) },
    compacting: { sleep_context: { draftRevision: 1, generations: [{ revision: 1, status: 'draft' }] } },
})) test(`response retry is absent when ${name}`, async () => {
    expect(await render(row)).not.toContain('data-agent-retry');
});
test('composer keeps draft send separate from response retry', async () => {
    const html = await render({}, 'stop');
    expect(html).not.toContain('data-agent-retry');
    expect(html).toContain('data-composer-send');
});
