import { expect, test } from 'bun:test';
import render from './agentMetaSection';
import knowledge from '../../plugins/knowledge/src/knowledge/agentMetaSection';

const escape = ({text}: any) => Bun.escapeHTML(String(text ?? ''));
const ctx: any = { fns: { procs: { ui: { escape, button: (o: any) => `<button data-action="${o.action}">${o.label}</button>` } }, ui: {
    toggle: (o: any) => `<input name="${o.name}" title="${o.title ?? ''}">${o.label}`,
    inspectorSection: (o: any) => `<section>${o.html}</section>`,
} } };
const agent: any = { id: 'test', scratchpad: {} };

test('goal rows offer two-line captions with complete escaped text and verification in disclosure', () => {
    const statement = 'Long <goal> '.repeat(30);
    const html = render(ctx, null, { agent: { ...agent, scratchpad: { goalTrackingEnabled: true, goalSidecar: { goals: [{ id: 'g', statement, verification: 'Check <evidence>', status: 'active', sourceMessageIdx: 7 }] } } }, section: 'goal' });
    expect(html).toContain('inspector-row-caption');
    expect(html).toContain(`<p class="inspector-detail">${Bun.escapeHTML(statement)}</p>`);
    expect(html).toContain('Check &lt;evidence&gt;');
    expect(html).toContain('g · message 7');
    expect(html).not.toContain('inspector-surface');
});

test('settings remain flat while preserving external-sharing warnings and RAG dependencies', () => {
    const html = render(ctx, null, { agent, section: 'settings', extraSettings: ['<form>Plugin settings</form>'] });
    expect(html).not.toContain('inspector-surface');
    expect(html).toContain('Jev sends data to an external provider. Do not include secrets.');
    expect(html).toContain('Requires Function RAG');
    expect(html).toContain('name="jevCompactionPresent"');
    expect(html).toContain('name="jevRiskReviewPresent"');
    expect(html).toContain('Opaque native checkpoints are skipped.');
    expect(html).toContain('Plugin settings');
    expect(html).toContain('hx-trigger="change delay:200ms"');
});

test('compaction keeps draft identity, reset, validation bounds and errors', () => {
    const html = render(ctx, null, { agent, section: 'compaction', globalCompactionPercent: 72 });
    expect(html).toContain('data-compaction-saved="72"');
    expect(html).toContain('min="15" max="95"');
    expect(render(ctx, null, { agent: { ...agent, autoCompactWindowPercent: 60 }, section: 'compaction' })).toContain('data-action="reset-compaction"');
    expect(html).toContain('data-compaction-error');
    expect(html).toContain('global token limit');
    expect(html).not.toContain('inspector-surface');
});

test('knowledge rows retain evidence, ambiguous alternatives, sources and error status', () => {
    const html = knowledge(ctx, null, { agent: { ...agent, scratchpad: { knowledgeTrackingEnabled: true, knowledgeSidecar: { status: 'error', error: '<offline>', mentions: [{ name: '<Person>', type: 'Person', status: 'ambiguous', evidence: '<quote>', sourceMessageIdx: 8, candidates: [{id: 'Person/a', title: 'Alternative'}] }] } } } });
    expect(html).not.toContain('inspector-surface');
    expect(html).toContain('inspector-list');
    expect(html).toContain('&lt;Person&gt;');
    expect(html).toContain('&lt;quote&gt;');
    expect(html).toContain('href="/knowledge/Person/a"');
    expect(html).toContain('href="/agent/test/message/8"');
    expect(html).toContain('data-tone="danger">Sidecar failed</span>: &lt;offline&gt;');
});
