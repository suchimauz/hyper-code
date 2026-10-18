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
    return new Response(ctx.fns.llms.accountsCard({ accounts, logins, models, nodes }), { headers: { "content-type": "text/html; charset=utf-8" } });
}
