/** Serves the live provider/account cards on the LLM connections page. */
export default async function (ctx: Context, _session: Session | null, _opts: { req?: Request }) {
    // The page should show live quota even before an account has handled its
    // first model request. Refresh provider usage endpoints, then list again so
    // accountsCard sees the snapshots just persisted by llm.recordUsage.
    const inventory = await ctx.fns.llm.listAccounts({});
    const [, logins] = await Promise.all([
        ctx.fns.llm.refreshUsage({ accounts: inventory.map((a: any) => ({ provider: a.provider, account: a.account })) }),
        Promise.resolve(ctx.fns.llm.accountLoginStatus({})),
    ]);
    const accounts = await ctx.fns.llm.listAccounts({});
    const models = await ctx.fns.llm.listModels({});
    const nodes = await ctx.fns.node.list({});
    const [zaiPlan, minimaxPlan, instanceRows] = await Promise.all([
        ctx.fns.llm.codingInstance({ provider: "zai-coding" }).catch(() => ({ instance: null })),
        ctx.fns.llm.codingInstance({ provider: "minimax-coding" }).catch(() => ({ instance: null })),
        ctx.fns.sshInstance.list({}).catch(() => []),
    ]);
    const planInstances = { zai: zaiPlan.instance, minimax: minimaxPlan.instance, instances: (instanceRows as any[]).filter(i => i?.pinnedHostKey).map(i => String(i.name)) };
    const minimax = {
        serviceTier: (await ctx.fns.settings.getString({ module: "llm", scopeType: "global", key: "minimaxCodingServiceTier" })) ?? "standard",
        maxTokens: await ctx.fns.settings.getNumber({ module: "llm", scopeType: "global", key: "minimaxCodingMaxTokens", fallback: 16384 }),
    };
    return new Response(ctx.fns.llms.accountsCard({ accounts, logins, models, nodes, minimax, planInstances }), { headers: { "content-type": "text/html; charset=utf-8" } });
}
