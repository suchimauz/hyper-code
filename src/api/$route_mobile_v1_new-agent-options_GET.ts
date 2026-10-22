/** Returns model and workspace defaults for the native new-agent form. */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }) {
    const [groups, defaultModel, agents, policy] = await Promise.all([
        ctx.fns.llm.listModels({}),
        ctx.fns.settings.modelDefault({}),
        ctx.fns.session.list({ includeArchived: true }),
        ctx.fns.llm.modelPolicy({ action: "list" }),
    ]);
    const canonical = (model: string) => (model.includes(":") ? model : `lmstudio:${model}`).replace(/^(?!hyper\/)([^/:]+)\/default:/, "$1:");
    const disabled = new Set(policy.disabledModels.map(canonical));
    const models = Object.entries(groups).flatMap(([provider, values]) => values.map(model => ({ provider, model, disabled: disabled.has(canonical(model)) })));
    const enabledDefault = models.find(model => !model.disabled && model.model === defaultModel)?.model
        ?? models.find(model => !model.disabled)?.model ?? "";
    const workspaces = Array.from(new Set(agents.map(agent => agent.workspaceDir).filter(Boolean))).sort();
    return Response.json({ version: 1, defaultModel: enabledDefault, models, workspaces });
}
