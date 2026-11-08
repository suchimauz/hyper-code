import { test, expect } from 'bun:test';
import quotaAccounts from './quotaAccounts';
import registry from './registry';
import authorize from '../sshInstance/authorize';

for (const role of ['owner', 'user']) {
    test(`quota metadata is read-only and secret-free for ${role}`, async () => {
        const session = { user: { role } } as Session;
        const ctx: any = { fns: { procs: { db: { select: async () => [{ value: JSON.stringify({ instance: 'host', provider: 'codex', account: 'work', status: 'pending', updatedAt: 1, token: 'NEVER_EXPORT' }) }] } } } };
        const rows = await quotaAccounts(ctx, session, {});
        expect(rows).toEqual([{ instance: 'host', provider: 'codex', account: 'work', status: 'pending', updatedAt: 1 }]);
        expect(JSON.stringify(rows)).not.toContain('NEVER_EXPORT');
    });
}

test('non-owner cannot read administrative registry or mutate SSH accounts', async () => {
    const session = { user: { role: 'user' } } as Session;
    const ctx: any = { fns: { sshAccount: { requireOwner: () => authorize(ctx, session, {}) } } };
    for (const action of ['list', 'begin', 'connect', 'fail', 'remove'] as const) {
        await expect(registry(ctx, session, { action, instance: 'host', provider: 'codex', account: 'work' })).rejects.toThrow('Only owners');
    }
});
