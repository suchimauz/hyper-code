import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import contextRing from './contextRing';
import header from './header';

const escape = ({ text }: { text: unknown }) => Bun.escapeHTML(String(text));
const popup = ({ attrs, html }: { attrs: string; html: string }) => `<button type="button" ${attrs}>${html}</button>`;

async function ring(used: number, capacity: number) {
    const ctx = {
        state: { agent: { ab: { model: 'test:echo' } } },
        fns: {
            procs: { db: { select: async () => [{ payload: JSON.stringify({ usage: { prompt_tokens: used, completion_tokens: 0 } }) }] }, ui: { escape } },
            compaction: { contextWindow: async () => capacity },
            ui: { popup },
        },
    } as unknown as Context;
    return contextRing(ctx, null, { agentId: 'ab' });
}

test('mobile context percentage stays exact beyond capacity and uses warning/error thresholds', async () => {
    for (const [used, percent, colour, fill] of [[40000, 40, 'subtle', '40.0%'], [75000, 75, 'warning', '75.0%'], [95000, 95, 'error', '95.0%'], [112000, 112, 'error', '100.0%']] as const) {
        const html = await ring(used, 100000);
        expect(html).toContain('data-context-meter');
        expect(html).toContain(`aria-hidden="true">${percent}%</span>`);
        expect(html).toContain(`data-context-total`);
        expect(html).toContain('data-context-pct');
        expect(html).toContain(`--p:${fill};--c:var(--color-${colour})`);
        expect(html).toContain(`· ${percent}% — click to compact`);
    }
});

test('context meter formats the compact used/window total, with m for millions', async () => {
    expect(await ring(253000, 1000000)).toContain('data-context-total');
    expect(await ring(253000, 1000000)).toContain('>253k/1m<');
    expect(await ring(71000, 100000)).toContain('71k/100k');
    expect(await ring(1500000, 1000000)).toContain('1.5m/1m');
    expect(await ring(950, 100000)).toContain('950/100k');
});

test('unknown context capacity shows tokens instead of a misleading percentage; unused is empty', async () => {
    const html = await ring(12345, 0);
    expect(html).toContain('12k');
    expect(html).not.toContain('data-context-pct');
    expect(await ring(0, 100000)).toBe('');
});

test('mobile header has the selected model mark even with a custom chat icon and escaped model metadata', async () => {
    const model = 'vendor:model-"<test>';
    const calls: Array<Record<string, unknown>> = [];
    const ctx = { fns: {
        procs: { ui: { escape } },
        chat: { renderParts: async () => [], icon: (opts: Record<string, unknown>) => { calls.push(opts); return '<img data-custom-avatar alt="">'; } },
        ui: { popup, inplacePopup: async () => '<button>More</button>', modelLogo: (opts: Record<string, unknown>) => { calls.push(opts); return '<svg data-selected-model></svg>'; } },
    } } as unknown as Context;
    const html = await header(ctx, null, { context: { agent: { id: 'ab', title: 'Chat', model, icon: '<svg>custom</svg>' } } as any });
    const w = new Window();
    try {
        w.document.body.innerHTML = html;
        expect(w.document.querySelector('[data-chat-avatar] [data-custom-avatar]')).not.toBeNull();
        expect(w.document.querySelector('[data-chat-model-mark] [data-selected-model]')).not.toBeNull();
        expect(w.document.querySelector('[data-chat-part="icon"]')!.getAttribute('aria-label')).toBe('Change provider or model: ' + model);
        expect(calls.some(c => c.model === model && c.bare === true && c.icon === undefined)).toBe(true);
    } finally { await w.happyDOM.close(); }
});
