import { expect, test } from 'bun:test';
import modelDisplayNames from './modelDisplayNames';

const catalog = {
    anthropic: { models: { 'claude-opus-4-5': { name: 'Claude Opus 4.5 (latest)' } } },
    openai: { models: { 'gpt-5': { name: 'GPT-5' } } },
};
const ctx: any = { fns: { llm: { modelsDevCatalog: async () => catalog } } };

test('maps routes through provider aliases, strips (latest) and prettifies unknown IDs', async () => {
    expect(await modelDisplayNames(ctx, null, { models: [
        'claude-code/default:claude-opus-4-5',
        'ssh/box:codex/me:gpt-5',
        'claude-code/default:claude-opus-5-5',
        'zai/x:glm-4.6',
    ] })).toEqual({
        'claude-code/default:claude-opus-4-5': 'Claude Opus 4.5',
        'ssh/box:codex/me:gpt-5': 'GPT-5',
        'claude-code/default:claude-opus-5-5': 'Claude Opus 5.5',
        'zai/x:glm-4.6': 'GLM-4.6',
    });
});

test('empty catalogue still yields readable fallbacks', async () => {
    const empty: any = { fns: { llm: { modelsDevCatalog: async () => ({}) } } };
    expect(await modelDisplayNames(empty, null, { models: ['codex/me:gpt-5.1-codex-mini'] })).toEqual({ 'codex/me:gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini' });
});
