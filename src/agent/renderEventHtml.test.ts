import { expect, test } from 'bun:test';
import render from './renderEventHtml';

test('ordinary events no longer invoke HTML helpers or erase stored HTML', async () => {
    const event = { type: 'assistant', text: 'fallback', html: '<p>saved respondHtml</p>' };
    expect(await render({ fns: {} } as any, null, { event })).toBe('');
    expect(event.html).toBe('<p>saved respondHtml</p>');
    for (const type of ['user', 'tool_busy', 'parked', 'team_update', 'wake_up', 'compaction_completed']) {
        expect(await render({ fns: {} } as any, null, { event: { type } })).toBe('');
    }
});
test('input compatibility delegates exact identity to the secure live card unchanged', async () => {
    const calls: string[] = [];
    const ctx: any = { fns: { input: { card: async ({ id }: { id: string }) => { calls.push(id); return '<secure-card>'; } } } };
    expect(await render(ctx, null, { event: { type: 'input', inputId: 'exact-id' }, agentId: 'a' })).toBe('<secure-card>');
    expect(calls).toEqual(['exact-id']);
});
