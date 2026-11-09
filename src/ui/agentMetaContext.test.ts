import { expect, test } from 'bun:test';
import knowledge from '../../plugins/knowledge/src/knowledge/agentMetaSection';

const escape = ({text}: any) => Bun.escapeHTML(String(text ?? ''));
const ctx: any = { fns: { procs: { ui: { escape, button: (o: any) => `<button data-action="${o.action}">${o.label}</button>` } }, ui: {
    toggle: (o: any) => `<input name="${o.name}" title="${o.title ?? ''}">${o.label}`,
    inspectorSection: (o: any) => `<section>${o.html}</section>`,
} } };
const agent: any = { id: 'test', scratchpad: {} };

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
