import { expect, test } from 'bun:test';
import render from './agentMetaSection';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx();
const agent: any = { id: 'work', model: 'test:model', scratchpad: {} };

test('plan retains update/archive/delete and read-first title', () => {
    const html = render(ctx, null, { agent: { ...agent, scratchpad: { plan: { title: 'Build', tasks: [{ id: 'one', title: 'Task', status: 'pending' }] } } }, section: 'plan' });
    expect(html).toContain('data-inspector-disclosure="plan-title"');
    expect(html).toContain('data-plan-editor');
    expect(html).toContain('data-plan-tasks');
    expect(html).toContain('name="title"');
    expect(html).toContain('Archive this plan?');
    expect(html).toContain('Delete this plan permanently?');
    expect(html).not.toContain('inspector-surface-');
});

test('team uses local archive scope and preserves recovery actions', () => {
    const member = { id: 'child', title: 'Child', status: 'blocked', runState: 'idle', plan: null, summary: 'Needs help', updatedAt: 1 };
    const html = render(ctx, null, { agent, section: 'team', team: [member], archivedTeam: [{ ...member, id: 'old', status: 'ready', archivedAt: 2 }] });
    expect(html).toContain('data-team-section');
    expect(html).toContain("this.closest('[data-team-section]')");
    expect(html).toContain('data-team-archive-list');
    expect(html).toContain('/team/child/retry');
    expect(html).toContain('/team/child/archive');
    expect(html).toContain('/team/old/unarchive');
    expect(html).toContain('href="/agent/child"');
    expect(html).toMatch(/type="submit"[^>]*data-action="restore-team-member"/);
    expect(html).not.toContain('inspector-surface-');
});

test('automation keeps all creation forms, active controls and run history', () => {
    const html = render(ctx, null, { agent, section: 'automation', triggers: [
        { id: 'live', kind: 'cron', status: 'active', config: { expression: '0 9 * * *' }, prompt: '<work>', timezone: 'UTC' },
        { id: 'past', kind: 'at', status: 'completed', prompt: 'Done', lastResult: { ok: true } },
    ] });
    for (const action of ['wake', 'cron', 'watch', 'run', 'cancel', 'cancelAll']) expect(html).toContain(`value="${action}"`);
    expect(html).toContain('Cancel all triggers?');
    expect(html).toContain('Recent runs');
    expect(html).toContain('/trigger/past');
    expect(html).toContain('&lt;work&gt;');
    expect(html).not.toContain('inspector-surface-');
});
