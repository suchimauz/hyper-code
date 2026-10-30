import { expect, test } from 'bun:test';
import author from './author';

 test('agent author reads its persisted hue even when the live agent already has a title', async () => {
    const queries: string[] = [];
    const ctx = {
        state: { agent: { abc: { title: 'Live title' } } },
        fns: { procs: { db: { select: async ({ sql, params }: { sql: string; params: string[] }) => {
            queries.push(sql);
            expect(params).toEqual(['abc']);
            return [{ title: 'Stored title', color_hue: 284.125 }];
        } } } },
    } as unknown as Context;
    for (let i = 0; i < 2; i++) {
        expect(await author(ctx, null, { userId: 'agent:abc' })).toMatchObject({ name: 'Live title · agent abc', hue: 284.125, kind: 'agent' });
    }
    expect(queries).toHaveLength(2);
    expect(queries.every(sql => sql.includes('color_hue'))).toBe(true);
});

test('unloaded agents use the stored title and hue; missing agents have a stable fallback', async () => {
    const ctx = {
        state: { agent: {} },
        fns: { procs: { db: { select: async ({ params }: { params: string[] }) => params[0] === 'saved' ? [{ title: 'Saved', color_hue: 0 }] : [] } } },
    } as unknown as Context;
    expect(await author(ctx, null, { userId: 'agent:saved' })).toMatchObject({ name: 'Saved · agent saved', hue: 0 });
    expect(await author(ctx, null, { userId: 'agent:deleted' })).toMatchObject({ hue: 210 });
    expect(await author(ctx, null, {})).toBeNull();
});
