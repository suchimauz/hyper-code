import { describe, expect, test } from 'bun:test';
import modelLogo from './modelLogo';

const ctx = { fns: { procs: { ui: { escape: ({ text }: any) => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;') } } } } as any;
const render = (model: string, active = false, bare = false, compact = false) => modelLogo(ctx, null, { model, active, bare, compact });

describe('ui.modelLogo', () => {
    test('maps the configured providers to local SVG marks', () => {
        for (const model of ['codex:gpt-5.6-sol', 'claude-code:claude-haiku-4-5', 'kimi:kimi-k3', 'xai:grok-4.6']) {
            const html = render(model);
            expect(html).toContain('<svg');
            expect(html).toContain(`title="${model}"`);
            expect(html).toContain(`aria-label="Model: ${model}"`);
        }
    });

    test('uses the Grok mark instead of the generic CPU icon', () => {
        const html = render('xai:grok-4.6');
        expect(html).toContain('<svg');
        expect(html).not.toContain('ph-cpu');
        expect(html).toContain('M9.27 15.29');
    });


    test('rotates the mark only while active', () => {
        expect(render('codex:gpt-5.6-sol', true)).toContain('animate-spin');
        expect(render('codex:gpt-5.6-sol')).not.toContain('animate-spin');
    });

    test('can render without a frame for compact navigation', () => {
        const html = render('codex:gpt-5.6-sol', false, true);
        expect(html).not.toContain('border-gray-200');
        expect(html).not.toContain('bg-white');
    });



    test('supports a smaller mark for dense navigation', () => {
        const html = render('codex:gpt-5.6-sol', false, true, true);
        expect(html).toContain('size-4');
        expect(html).toContain('size-2.5');
        expect(html).not.toContain('size-6');
    });
    test('uses a generic mark for an unknown provider', () => {
        expect(render('local:some-model')).toContain('ph-cpu');
    });
});

test('provider marks explicitly inherit the theme foreground in every size and frame', () => {
    for (const model of ['codex:gpt', 'claude-code:claude', 'xai:grok', 'kimi:kimi', 'hyper/node:codex:gpt']) {
        for (const bare of [false, true]) for (const compact of [false, true]) {
            const html = render(model, false, bare, compact);
            expect(html).toContain('text-base-content');
            expect(html).toContain('fill="currentColor"');
            expect(html).not.toContain('text-faint');
            expect(html).not.toContain('text-subtle');
        }
    }
    expect(render('local:unknown')).toContain('text-base-content');
});
test('SSH keeps exact provider mark with a small terminal corner badge in every variant', () => {
    for(const model of ['codex/work:o3','claude-code/work:sonnet']) for(const bare of [false,true]) for(const compact of [false,true]) {
        const local=render(model,true,bare,compact);
        const ssh=render(`ssh/claude-gpt-host:${model}`,true,bare,compact);
        expect(ssh.match(/<svg[\s\S]*?<\/svg>/)?.[0]).toBe(local.match(/<svg[\s\S]*?<\/svg>/)?.[0]);
        expect(ssh).toContain('ph-terminal-window absolute -bottom-1 -right-1');
        expect(ssh).toContain('(via SSH claude-gpt-host)');
        expect(ssh).not.toContain('ph-arrows-left-right');
        expect(local).not.toContain('ph-terminal-window');
    }
    expect(render('hyper/node:codex/work:o3')).toContain('ph-arrows-left-right');
    expect(render('hyper/node:codex/work:o3')).not.toContain('ph-terminal-window');
});
