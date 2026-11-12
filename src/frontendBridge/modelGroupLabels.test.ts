import { expect, test } from 'bun:test';
import labels from './modelGroupLabels';

test('proxy groups use account names, deduplicate lookups, and exclude direct and remote routes', async () => {
    const calls: string[] = [];
    const ctx = { fns: { llm: { accountProxy: async ({ provider, account }: {provider:string;account:string}) => {
        expect(provider).toBe('anthropic-oauth'); calls.push(account);
        if (account === 'direct') return null;
        return {id:'p',name:account === 'default' ? null : 'Work proxy',host:'proxy.test',port:1080};
    } } } } as any;
    const result = await labels(ctx, null, {models:[
        'anthropic-oauth/work:opus', 'anthropic-oauth/work:sonnet', 'anthropic-oauth/personal:opus',
        'anthropic-oauth:opus', 'anthropic-oauth/default:sonnet', 'anthropic-oauth/direct:opus',
        'ssh/host:anthropic-oauth/work:opus', 'mauzcode/node:anthropic-oauth/work:opus', 'openai:gpt',
    ]});
    expect(result).toEqual({
        'anthropic-oauth/work:opus':'socks5 · Work proxy · claude/work',
        'anthropic-oauth/work:sonnet':'socks5 · Work proxy · claude/work',
        'anthropic-oauth/personal:opus':'socks5 · Work proxy · claude/personal',
        'anthropic-oauth:opus':'socks5 · proxy.test:1080 · claude/default',
        'anthropic-oauth/default:sonnet':'socks5 · proxy.test:1080 · claude/default',
    });
    expect(calls.sort()).toEqual(['default','direct','personal','work']);
});

test('binding storage failure cannot silently label a proxy account as direct', async () => {
    const ctx = {fns:{llm:{accountProxy:async()=>{throw Error('PROXY_CONFIG');}}}} as any;
    await expect(labels(ctx,null,{models:['anthropic-oauth:opus']})).rejects.toThrow('PROXY_CONFIG');
});
