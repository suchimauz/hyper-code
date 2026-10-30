import { describe, expect, test } from 'bun:test';
import retainGenerations from './retainGenerations';

// Pure retention tests: no live agents, transcript writes, or recovery runs.
const retain = (generations: Array<{ revision: number; [key: string]: unknown }>, activeRevision: number | null, draftRevision: number | null) =>
    retainGenerations({} as Context, null, { generations, activeRevision, draftRevision });

describe('compaction.retainGenerations', () => {
    test('more than eight failed attempts cannot evict the active generation', async () => {
        const active = { revision: 1, status: 'active', contextMessages: [{ role: 'user', content: 'summary' }] };
        let generations = [active] as Array<{ revision: number; [key: string]: unknown }>;
        for (let revision = 2; revision <= 20; revision++) {
            const draft = { revision, status: 'draft' };
            const input = [...generations, draft];
            const snapshot = JSON.stringify(input);
            generations = await retain(input, 1, revision);
            expect(JSON.stringify(input)).toBe(snapshot);
            expect(generations).toContain(active);
            expect(generations).toContain(draft);
            expect(generations.length).toBeLessThanOrEqual(8);
            generations = generations.map(g => g === draft ? { ...g, status: 'failed' } : g);
        }
        expect(generations.map(g => g.revision)).toEqual([1, 14, 15, 16, 17, 18, 19, 20]);
        expect(generations[0]).toBe(active);
    });

    test('successful promotion protects the new active head through later failed drafts', async () => {
        let generations = Array.from({ length: 20 }, (_, i) => ({ revision: i + 1, status: i === 0 ? 'active' : 'failed' }));
        generations = await retain([...generations, { revision: 21, status: 'draft' }], 1, 21) as typeof generations;
        expect(generations.some(g => g.revision === 1)).toBe(true);
        expect(generations.some(g => g.revision === 21)).toBe(true);
        generations = generations.map(g => ({ ...g, status: g.revision === 21 ? 'active' : g.revision === 1 ? 'completed' : g.status }));
        for (let revision = 22; revision <= 40; revision++) {
            generations = await retain([...generations, { revision, status: 'draft' }], 21, revision) as typeof generations;
            expect(generations.some(g => g.revision === 21 && g.status === 'active')).toBe(true);
            expect(generations.at(-1)?.revision).toBe(revision);
            generations = generations.map(g => g.revision === revision ? { ...g, status: 'failed' } : g);
        }
        expect(generations.map(g => g.revision)).toEqual([21, 34, 35, 36, 37, 38, 39, 40]);
    });

    test('protects an older pending revision and bounds unprotected history', async () => {
        const generations = Array.from({ length: 20 }, (_, i) => ({ revision: i + 1 }));
        expect((await retain(generations, 1, 2)).map(g => g.revision)).toEqual([1, 2, 15, 16, 17, 18, 19, 20]);
        expect((await retain(generations, null, null)).map(g => g.revision)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
        expect(await retain([], null, null)).toEqual([]);
    });
});
