import { expect, test } from 'bun:test';
import render from './agentMetaSection';
import taskRow from './planTaskRow';
import parked from './parkedCard';
import knowledge from '../../plugins/knowledge/src/knowledge/agentMetaSection';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx();
const agent: any = { id: 'badges', model: 'test:model', scratchpad: {} };
const badge = (tone: string, label: string) => `class="inspector-status-badge" data-tone="${tone}">${label}</span>`;

test('task states share tones while elapsed time stays outside the badge', () => {
    for (const [status, tone, label] of [['pending', 'waiting', 'Pending'], ['active', 'active', 'In progress'], ['done', 'success', 'Done'], ['failed', 'danger', 'failed']]) {
        const html = taskRow(ctx, null, { task: { id: 'one', status, elapsedMs: 60000 } });
        expect(html).toContain(badge(tone!, label!));
        expect(html).toContain('</span> <span class="inspector-task-time">· 1m</span>');
        expect(html).toContain('inspector-detail-body');
        expect(html).toContain(`data-task-status="${status}"`);
    }
});

test('goals use badges and padded detail containers without inline overrides', () => {
    const html = render(ctx, null, { agent: { ...agent, scratchpad: { goalTrackingEnabled: true, goalSidecar: { goals: [{ id: 'g', status: 'active', statement: '<goal>' }] } } }, section: 'goal' });
    expect(html).toContain(badge('active', 'active'));
    expect(html).toContain('inspector-detail-body');
    expect(html).not.toContain('padding-left:0');
    expect(html).toContain('inspector-toggle-state inspector-status-badge');
    expect(html).toContain('aria-hidden="true">Вкл.</span><input');
    expect(html).toContain('&lt;goal&gt;');
});

test('team, automation outcomes and header counts share semantic badges', () => {
    const team = render(ctx, null, { agent, section: 'team', team: [{ id: 'child', title: 'Child', status: 'blocked', runState: 'idle', plan: null, summary: null, updatedAt: 0 }] });
    expect(team).toContain(badge('danger', 'blocked'));
    const html = render(ctx, null, { agent, section: 'automation', triggers: [{ id: 't', kind: 'cron', status: 'active', lastOutcome: 'failed', attempts: 2, config: {}, prompt: '<run>' }] });
    expect(html).toContain(badge('active', '1 active'));
    expect(html).toContain(badge('active', 'active'));
    expect(html).toContain(badge('danger', 'failed'));
    expect(html).not.toContain('>Schedule</span><span class="inspector-status-badge"');
    expect(html).toContain('value="run"');
});

test('nested and archived team task states stay readable and use padded disclosures', () => {
    const member = { id: 'child', title: 'Child', status: 'ready', runState: 'idle', plan: { tasks: [{ id: 'done', title: 'Finished', status: 'done' }, { id: 'pending', title: 'Queued', status: 'pending' }] }, summary: null, updatedAt: 0 };
    const html = render(ctx, null, { agent, section: 'team', team: [member], archivedTeam: [{ ...member, id: 'archived' }] });
    expect(html).toContain(badge('neutral', 'archived'));
    expect(html.match(/data-tone="success">done<\/span>/g)?.length).toBe(2);
    expect(html.match(/data-tone="waiting">pending<\/span>/g)?.length).toBe(2);
    expect(html).toContain('data-inspector-disclosure="archived-team-archived"');
    expect(html).toContain('class="inspector-detail-body"');
});

test('settings badges remain inside labels and do not interrupt switch sibling hooks', () => {
    const html = render(ctx, null, { agent, section: 'settings' });
    expect(html).toContain('aria-hidden="true">Недоступно</span><input');
    expect(html).toContain('aria-hidden="true">Выкл.</span><input');
    expect(html).toMatch(/<input[^>]+class="ui-toggle-input[^>]+><span class="ui-toggle-track"/);
    const compact = render(ctx, null, { agent, section: 'compaction' });
    expect(compact).not.toContain('inspector-status-badge');
});

test('knowledge and parked states use the same badge contract', () => {
    const html = knowledge(ctx, null, { agent: { ...agent, scratchpad: { knowledgeTrackingEnabled: true, knowledgeSidecar: { mentions: [{ name: '<Name>', status: 'matched', type: 'Person' }] } } } });
    expect(html).toContain(badge('success', 'matched'));
    expect(html).toContain('aria-hidden="true">Вкл.</span><input');
    expect(html).toContain('&lt;Name&gt;');
    expect(parked(ctx, null, { agent: { ...agent, scratchpad: { parked: { provider: 'test', resetsAt: Date.now() + 60000 } } } })).toContain(badge('waiting', 'Parked · usage limit'));
});
