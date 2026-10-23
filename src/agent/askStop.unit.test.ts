import { test, expect } from 'bun:test';
import ask from './ask';

function fixture(mode: 'stopped' | 'revoked' | 'replacement' | 'normal') {
    let token = '', appended = 0, ran = 0;
    const child: any = { id: 'child' };
    const queries: string[] = [];
    const ctx: any = { state: { agent: { child } }, fns: {
        procs: { db: {
            select: async ({ sql, params }: any) => {
                queries.push(sql);
                if (sql.startsWith('SELECT parent_id')) return [{ parent_id: 'parent' }];
                if (sql.startsWith('UPDATE agents')) {
                    expect(sql).toContain('stopped_at IS NULL');
                    expect(sql).toContain('run_token = ?');
                    token = params[2];
                    return mode === 'stopped' ? [] : [{ id: 'child' }];
                }
                expect(sql).toContain('run_token = ?');
                return mode === 'revoked' ? [] : [{ run_token: token }];
            },
            run: async ({ sql, params }: any) => {
                queries.push(sql);
                expect(sql).toContain('WHERE id = ? AND run_token = ?');
                expect(params[2]).toBe(token);
                return { changes: mode === 'replacement' ? 0 : 1 };
            },
        } },
        session: { appendUserMessage: async () => { appended++; }, syncAgentState: async () => {} },
        agent: { run: async () => { ran++; expect(child.currentJobId).toBe(token); if (mode === 'replacement') child.currentJobId = 'new'; return { text: 'answer' }; }, steer: async () => {} },
    } };
    return { ctx, child, counts: () => ({ appended, ran }), queries };
}

test('parent ask cannot claim a stopped child', async () => {
    const f = fixture('stopped');
    await expect(ask(f.ctx, null, { agent: { id: 'parent' } as any, member: 'child', question: 'q' })).rejects.toThrow('busy or stopped');
    expect(f.counts()).toEqual({ appended: 0, ran: 0 });
});
test('Stop winning during child load prevents follow-up dispatch', async () => {
    const f = fixture('revoked');
    await expect(ask(f.ctx, null, { agent: { id: 'parent' } as any, member: 'child', question: 'q' })).rejects.toThrow('ownership lost');
    expect(f.counts()).toEqual({ appended: 0, ran: 0 });
});
test('ask finalization is fenced and preserves replacement ownership', async () => {
    const f = fixture('replacement');
    expect(await ask(f.ctx, null, { agent: { id: 'parent' } as any, member: 'child', question: 'q' })).toEqual({ member: 'child', answer: 'answer' });
    expect(f.child.currentJobId).toBe('new');
});
test('successful owned ask releases its token', async () => {
    const f = fixture('normal');
    await ask(f.ctx, null, { agent: { id: 'parent' } as any, member: 'child', question: 'q' });
    expect(f.child.currentJobId).toBeNull();
    expect(f.counts()).toEqual({ appended: 1, ran: 1 });
});
