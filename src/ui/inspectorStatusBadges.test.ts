import { expect, test } from 'bun:test';
import knowledge from '../../plugins/knowledge/src/knowledge/agentMetaSection';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx();
const agent: any = { id: 'badges', model: 'test:model', scratchpad: {} };
const badge = (tone: string, label: string) => `class="inspector-status-badge" data-tone="${tone}">${label}</span>`;

test('knowledge states use the same badge contract', () => {
    const html = knowledge(ctx, null, { agent: { ...agent, scratchpad: { knowledgeTrackingEnabled: true, knowledgeSidecar: { mentions: [{ name: '<Name>', status: 'matched', type: 'Person' }] } } } });
    expect(html).toContain(badge('success', 'matched'));
    expect(html).toContain('aria-hidden="true">Вкл.</span><input');
    expect(html).toContain('&lt;Name&gt;');
});
