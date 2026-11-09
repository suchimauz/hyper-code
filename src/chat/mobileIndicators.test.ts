import { expect, test } from 'bun:test';
import contextRing from './contextRing';

const escape = ({ text }: { text: unknown }) => Bun.escapeHTML(String(text));
const popup = ({ attrs, html }: { attrs: string; html: string }) => `<button type="button" ${attrs}>${html}</button>`;

async function ring(used: number, capacity: number) {
    const ctx = {
        state: { agent: { ab: { model: 'test:echo' } } },
        fns: {
            procs: { ui: { escape } },
            agent: { contextBudget: async () => ({ estimatedTokens: used, contextWindow: capacity || null, mode: 'full', fallback: null, revision: null, messageCount: 1, lastReportedTokens: null, lastReportedAt: null }) },
            ui: { popup },
        },
    } as unknown as Context;
    return contextRing(ctx, null, { agentId: 'ab' });
}

test('mobile context ring thresholds and fill caps at full beyond capacity', async () => {
    for (const [used, percent, colour, fill] of [[40000, 40, 'subtle', '40.0%'], [75000, 75, 'warning', '75.0%'], [95000, 95, 'error', '95.0%'], [112000, 112, 'error', '100.0%']] as const) {
        const html = await ring(used, 100000);
        expect(html).toContain('data-context-meter');
        expect(html).toContain('data-context-total');
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
    expect(html).toContain('>12k<');
    expect(html).not.toContain('≈');
    expect(html).not.toContain('data-context-total');
    expect(await ring(0, 100000)).toBe('');
});
