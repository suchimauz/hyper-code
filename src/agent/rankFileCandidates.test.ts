import { describe, test, expect } from 'bun:test';

// Raw import is deliberately test-only; production dispatch uses ctx.fns.
const rank = (await import('./rankFileCandidates')).default;
const candidates = [{ path: '/private/project/a.ts' }, { path: '/private/project/b.ts', description: 'parser' }, { path: '/private/project/c.ts' }];
function harness(config: { enabled?: boolean; answers?: any; hang?: boolean; error?: boolean; dbError?: boolean; noCaller?: boolean } = {}) {
    const calls: any[] = []; const queries: any[] = [];
    const ctx: any = { fns: {
        agent: { current: async () => { if (config.noCaller) throw Error('none'); return { id: 'caller' }; } },
        procs: { db: { select: async (q: any) => { queries.push(q); if (config.dbError) throw Error('missing column'); return [{ jev_file_ranking_enabled: config.enabled ?? true }]; } } },
        jev: { decide: async (q: any) => { calls.push(q); if (config.error) throw Error('private error'); if (config.hang) return new Promise(() => {}); return { answers: config.answers ?? { c0: { type: 'noul', noul: 0.2 }, c1: { type: 'noul', noul: 0.9 }, c2: { type: 'noul', noul: 0.9 } }, usage: { inputTokens: 15, outputTokens: 3, cost: null } }; } },
        files: new Proxy({}, { get() { throw Error('filesystem access forbidden'); } }),
        tools: new Proxy({}, { get() { throw Error('commands forbidden'); } }),
    } };
    return { calls, queries, run: (opts: any = { task: 'parser bug', candidates }) => rank(ctx, null, opts) };
}
describe('rankFileCandidates advisory privacy and fail-open contract', () => {
    test('one batch, stable ties, exact paths retained, directory prefixes never sent', async () => {
        const h = harness(); const out = await h.run();
        expect(out.fallback).toBe(false); expect(out.candidates).toEqual([candidates[1], candidates[2], candidates[0]]);
        expect(out.scores?.map(s => s.score)).toEqual([0.9, 0.9, 0.2]);
        expect(h.calls).toHaveLength(1); expect(h.calls[0].timeoutMs).toBe(2800); expect(h.calls[0].retries).toBe(0);
        expect(Object.keys(h.calls[0].questions)).toEqual(['c0', 'c1', 'c2']);
        expect(Object.values(h.calls[0].questions).every((q: any) => q.type === 'noul')).toBe(true);
        expect(JSON.stringify(h.calls)).not.toContain('/private/project');
        expect(h.calls[0].state.candidates).toEqual([{ id: 'c0', basename: 'a.ts' }, { id: 'c1', basename: 'b.ts', description: 'parser' }, { id: 'c2', basename: 'c.ts' }]);
        expect(h.queries[0].params).toEqual(['caller']); expect(h.queries[0].sql).toContain('archived_at IS NULL');
        expect(out.usage?.inputTokens).toBe(15); expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    });
    test('off, missing caller and unavailable DB never call provider', async () => {
        for (const config of [{ enabled: false }, { noCaller: true }, { dbError: true }]) {
            const h = harness(config); const out = await h.run(); expect(out.fallback).toBe(true); expect(out.candidates).toEqual(candidates); expect(h.calls).toHaveLength(0);
        }
        expect((await harness({ dbError: true }).run()).status).toBe('flag-unavailable');
    });
    test('invalid/repeated paths, metadata lengths and unsupported inputs fail unchanged', async () => {
        for (const opts of [
            { task: 'x'.repeat(4001), candidates }, { task: '', candidates },
            { task: 'x', candidates: [candidates[0], candidates[0]] },
            ...['https://host/a', '//host/a', '\\\\host\\a', 'a\n', 'x'.repeat(1025), ''].map(path => ({ task: 'x', candidates: [{ path }] })),
            { task: 'x', candidates: [{ path: 'a', description: 'x'.repeat(1001) }] },
            { task: 'x', candidates: Array.from({ length: 21 }, (_, i) => ({ path: String(i) })) },
            { task: 'x', candidates: [] },
        ]) { const h = harness(); const out = await h.run(opts); expect(out.status).toBe('invalid-input'); expect(out.candidates).toEqual(opts.candidates); expect(h.calls).toHaveLength(0); }
    });
    test('hallucinations, incomplete answers and nonfinite scores never change ordering', async () => {
        const valid = { c0: { type: 'noul', noul: 0.2 }, c1: { type: 'noul', noul: 0.9 }, c2: { type: 'noul', noul: 0.9 } };
        for (const answers of [{}, { ...valid, unexpected: { type: 'noul', noul: 1 } }, { c0: valid.c0 }, ...[NaN, Infinity, -0.1, 1.1, '0.5', undefined].map(noul => ({ ...valid, c1: { type: 'noul', noul } })), { ...valid, c1: { type: 'choice', choice: '/evil' } }]) {
            const h = harness({ answers }); const out = await h.run(); expect(out.status).toBe('invalid-response'); expect(out.candidates).toEqual(candidates); expect(out.scores).toBeNull();
        }
    });
    test('provider failure does not expose error text', async () => { const out = await harness({ error: true }).run(); expect(out.status).toBe('provider-unavailable'); expect(out.candidates).toEqual(candidates); expect(JSON.stringify(out)).not.toContain('private error'); });
    test('hung provider wall cap preserves ordering', async () => { const start = performance.now(); const out = await harness({ hang: true }).run(); expect(out.status).toBe('timeout'); expect(out.candidates).toEqual(candidates); expect(performance.now() - start).toBeLessThan(3500); }, 5000);
});
