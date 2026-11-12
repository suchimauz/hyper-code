/** Returns the configured default model as a canonical `[ssh/<host>:]<provider>/<account>:<model>` route. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<string> {
    const value = (await ctx.fns.settings?.getString?.({
        module: 'llm',
        scopeType: 'global',
        key: 'defaultModel',
        fallback: ctx.env.MODEL ?? 'claude-code/default:claude-opus-5',
    })) ?? (ctx.env.MODEL ?? 'claude-code/default:claude-opus-5');
    try { return ctx.fns.llm.parseModelRoute({ model: value }).route; } catch { return value; }
}
