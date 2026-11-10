import { expect, test } from 'bun:test';
import mutationRun from './mutationRun';
import guard from './guard';

function fixture(migrated = false) {
    let ran = false;
    const ctx: any = { state: {}, fns: {
        sshAccount: { requireOwner: async () => {}, registry: async () => migrated ? [{ instance: 'example-host', provider: 'codex', account: 'test' }] : [] },
        codexTunnel: {
            scopedService: () => { throw Error('Must not resolve a hard-coded account'); },
            encryptedStore: () => ({ read: async () => migrated ? { value: { version: 1, mode: 'socks' } } : null }),
        },
    } };
    ctx.fns.codexTunnel.guard = (opts: any) => guard(ctx, null, opts);
    return { ctx, work: async () => { ran = true; return 'saved'; }, ran: () => ran };
}
test('first host-key pin does not require a pre-existing Codex account', async () => {
    const f = fixture();
    expect(await mutationRun(f.ctx, null, { operation: 'descriptor', instance: 'example-host', work: f.work })).toBe('saved');
});
test('first Codex login does not resolve an old test-slot binding', async () => {
    const f = fixture();
    expect(await mutationRun(f.ctx, null, { operation: 'login', instance: 'example-host', provider: 'codex', account: 'test', work: f.work })).toBe('saved');
});
test('persisted migrated credentials still block endpoint mutation', async () => {
    const f = fixture(true);
    await expect(mutationRun(f.ctx, null, { operation: 'descriptor', instance: 'example-host', work: f.work })).rejects.toThrow('Migrated credentials require explicit recovery');
    expect(f.ran()).toBe(false);
});
