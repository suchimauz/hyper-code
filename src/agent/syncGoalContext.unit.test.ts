import { test, expect } from 'bun:test';
import sync from './syncGoalContext';
import promptContext from '../goal/promptContext';

function fixture() {
    let state: any = { enabled: false };
    const agent: any = { id: 'a', messages: [{ role: 'user', content: 'hi' }], scratchpad: {} };
    const ctx: any = { fns: {
        goal: { read: async () => state, nativeCapability: async () => ({ available: true }), promptContext: (o: any) => promptContext({} as any, null, o) },
        session: {
            appendMessage: async ({ message }: any) => { agent.messages.push(message); },
            syncAgentState: async () => {},
            mutateScratchpad: async () => {},
        },
        procs: { log: { warn: () => {} } },
    } };
    return { ctx, agent, set: (s: any) => { state = s; } };
}
const goal = (patch: any = {}) => ({ agentId: 'a', goalId: 'g', schemaVersion: 1, revision: 1, objective: 'ship', status: 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 1, updatedAt: 1, ...patch });
const rows = (agent: any) => agent.messages.filter((m: any) => m.message_type === 'goal_context');

test('no goal ever: nothing appended', async () => {
    const h = fixture();
    expect(await sync(h.ctx, null, { agent: h.agent })).toEqual({ appended: false, reason: 'no_goal' });
    expect(rows(h.agent)).toHaveLength(0);
});

test('appends once, ignores counter/revision churn, appends again only on real change', async () => {
    const h = fixture();
    h.set({ enabled: true, goal: goal() });
    expect((await sync(h.ctx, null, { agent: h.agent })).reason).toBe('first');
    h.set({ enabled: true, goal: goal({ revision: 9, tokensUsed: 5000, updatedAt: 9 }) });
    expect((await sync(h.ctx, null, { agent: h.agent })).reason).toBe('unchanged');
    expect(rows(h.agent)).toHaveLength(1);
    const firstRow = JSON.stringify(rows(h.agent)[0]);
    h.set({ enabled: true, goal: goal({ objective: 'ship more' }) });
    expect((await sync(h.ctx, null, { agent: h.agent })).reason).toBe('changed');
    h.set({ enabled: true, goal: goal({ objective: 'ship more', status: 'paused' }) });
    await sync(h.ctx, null, { agent: h.agent });
    h.set({ enabled: true, goal: null });
    await sync(h.ctx, null, { agent: h.agent });
    const all = rows(h.agent);
    expect(all).toHaveLength(4);
    expect(JSON.stringify(all[0])).toBe(firstRow);
    expect(all[2].content).toContain('Goal continuation revoked');
    expect(all[3].content).toContain('no current goal');
    expect(all.every((m: any) => m.excluded_from_cursor === true && m.role === 'user')).toBe(true);
});

test('never splits a tool call from its result', async () => {
    const h = fixture();
    h.set({ enabled: true, goal: goal() });
    h.agent.messages.push({ role: 'assistant', content: '', tool_calls: [{ id: 'c' }] });
    expect((await sync(h.ctx, null, { agent: h.agent })).reason).toBe('tool_call_tail');
});
