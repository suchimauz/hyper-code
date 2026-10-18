import { describe, test, expect } from 'bun:test';
import archiveRoute from './$route_$id_archive_POST';

describe('POST /agent/:id/archive', () => {
    test('archives agent, preserves live state, and redirects form posts to home', async () => {
        const calls: string[] = [];
        const live = { id: 'a1', workspaceDir: '/fixture' };
        // Route contract only: no database or unrelated plugin setup is required.
        const ctx = { state: { agent: { a1: live } }, fns: { session: {
            archive: async ({ id }: { id: string }) => {
                expect(ctx.state.agent.a1).toBe(live);
                calls.push(id);
                return { ok: true };
            },
        } } } as unknown as Context;
        const res = await archiveRoute(ctx, null, {
            req: new Request('http://fixture/agent/a1/archive', { method: 'POST' }),
            params: { id: 'a1' },
        });
        expect(calls).toEqual(['a1']);
        expect(ctx.state.agent.a1).toBe(live);
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toBe('/?archived=a1');
    });
});
