/**
 * Return authenticated read-only model choices and agent reasoning settings
 *
 * Use for the React model selector on the authenticated MauzCode origin. Preserves full native model routes and disabled policy, with inert provider icons and current persisted reasoning preferences. Does not change agents or credentials.
 * @param opts.agentId Existing unarchived agent identifier, one to 128 ASCII letters, digits, underscores or hyphens.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing unarchived agent identifier, one to 128 ASCII letters, digits, underscores or hyphens. */
        agentId: string;
    },
): Promise<{ version: 1; agentId: string; model: string; label: string; icon: {src:string;custom:boolean}|null; running: boolean; defaultModel: string; models: Array<{provider:string;model:string;label:string;groupLabel?:string;disabled:boolean;icon:{src:string;custom:boolean}|null}>; effort: {requested:types.llm.ReasoningEffort;applied:types.llm.ReasoningEffort;supported:types.llm.ReasoningEffort[];defaultEffort:types.llm.ReasoningEffort;mode:types.llm.ReasoningProfile["mode"];downgraded:boolean} }> {
    if (!(session as Session & {user?:{id:string}})?.user) throw new Error("Unauthorized");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(opts.agentId)) throw new Error("Invalid agentId");
    const rows = await ctx.fns.procs.db.select({sql:"SELECT id, model, reasoning_effort, run_state FROM agents WHERE id = ? AND archived_at IS NULL",params:[opts.agentId]});
    const row = rows[0];
    if (!row) throw new Error("Agent not found");
    const currentModel = String(row.model ?? "");
    const requested = String(row.reasoning_effort ?? "auto") as types.llm.ReasoningEffort;
    const [groups, defaultModel, policy, profile, resolved] = await Promise.all([ctx.fns.llm.listModels({}),ctx.fns.settings.modelDefault({}),ctx.fns.llm.modelPolicy({action:"list"}),ctx.fns.llm.reasoningCapabilities({model:currentModel}),ctx.fns.llm.resolveReasoningEffort({model:currentModel,effort:requested})]);
    const canonical = (model:string) => { try { return ctx.fns.llm.parseModelRoute({model}).route; } catch { return model; } };
    const disabled = new Set(policy.disabledModels.map(canonical));
    const groupLabels = await ctx.fns.frontendBridge.modelGroupLabels({models:Object.values(groups).flat()});
    const models = await Promise.all(Object.entries(groups).flatMap(([provider,values])=>values.map(async model=>({provider,model,...(groupLabels[model] ? {groupLabel:groupLabels[model]} : {}),label:model.slice(model.lastIndexOf(":")+1),disabled:disabled.has(canonical(model)),icon:await ctx.fns.frontendBridge.iconData({model})}))));
    const enabledDefault = models.find(m=>!m.disabled && m.model===defaultModel)?.model ?? models.find(m=>!m.disabled)?.model ?? "";
    const live = ctx.state.agent?.[opts.agentId];
    return {version:1,agentId:opts.agentId,model:currentModel,label:currentModel.slice(currentModel.lastIndexOf(":")+1),icon:await ctx.fns.frontendBridge.iconData({model:currentModel}),running:row.run_state==="running" || Number(live?.activeRunCount ?? 0)>0,defaultModel:enabledDefault,models,effort:{requested,applied:resolved.applied,supported:profile.supported,defaultEffort:profile.defaultEffort,mode:profile.mode,downgraded:resolved.downgraded}};
}
