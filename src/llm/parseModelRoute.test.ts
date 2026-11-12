import { test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('every model route form normalises onto [ssh/<host>:]<provider>/<account>:<model>', async () => {
    const c = await mkTestCtx({});
    const route = (model: string) => c.fns.llm.parseModelRoute({ model }).route;
    expect(route('codex:gpt-5')).toBe('codex/default:gpt-5');
    expect(route('codex/me:gpt-5')).toBe('codex/me:gpt-5');
    expect(route('qwen3-coder')).toBe('lmstudio/default:qwen3-coder');
    expect(route('groq:openai/gpt-oss-20b')).toBe('groq/default:openai/gpt-oss-20b');
    expect(route('mauzcode/node:codex/x:gpt-5')).toBe('mauzcode/node:codex/x:gpt-5');
    expect(c.fns.llm.parseModelRoute({ model: 'ssh/box:claude-code/a:claude-haiku-4-5' })).toMatchObject({ host: 'box', provider: 'claude-code', account: 'a', model: 'claude-haiku-4-5', canonical: true });
    expect(() => route('ssh/box:codex:gpt-5')).toThrow();
    expect(() => route('codex/..:gpt-5')).toThrow();
    expect(c.fns.llm.formatModelRoute({ provider: 'codex', model: 'gpt-5' })).toBe('codex/default:gpt-5');
    expect(c.fns.llm.formatModelRoute({ provider: 'codex', account: 'me', model: 'gpt-5', host: 'box' })).toBe('ssh/box:codex/me:gpt-5');
});

test('vendor follows the model, not the serving provider', async () => {
    const c = await mkTestCtx({});
    const vendor = (model: string) => c.fns.llm.modelVendor({ model });
    expect(vendor('opencode/default:kimi-k2')).toBe('moonshot');
    expect(vendor('opencode/default:claude-sonnet-4-5')).toBe('anthropic');
    expect(vendor('openrouter:z-ai/glm-5')).toBe('zai');
    expect(vendor('ssh/box:codex/me:gpt-6')).toBe('openai');
    expect(vendor('mauzcode/node:claude-code/x:claude-opus-5')).toBe('anthropic');
    expect(vendor('oneapi:something-new')).toBe('unknown');
});
