import { resolve } from 'node:path';

/** Create an independent agent from shared creation-form fields after validating its workspace or visible project. * @param opts.title Human-readable agent title.
 * @param opts.projectId Visible project whose stored directory and SSH alias override submitted workspace fields.
 * @param opts.workspaceDir Workspace directory assigned to the agent.
 * @param opts.createWorkspaceDir Whether to create a missing workspace directory.
 * @param opts.model Model identifier to use.
 * @param opts.promptPreset System-prompt preset name.
 * @param opts.systemPrompt Additional system instructions.
*/
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Visible project whose authoritative directory and host are used; no agent is created if it is inaccessible. */
projectId?: string;
        /** Human-readable title. */
title?: string;
        /** Workspace dir used by the operation. */
workspaceDir?: string;
        /** Create workspace dir used by the operation. */
createWorkspaceDir?: string;
        /** Model identifier. */
model?: string;
        /** Prompt preset used by the operation. */
promptPreset?: string | string[];
        /** Additional system instructions. */
systemPrompt?: string }): Promise<{ agent?: any; confirmation?: { dir: string; values: Record<string, any> }; error?: string }> {
    const requestedWorkspace = String(opts.workspaceDir ?? '');
    try {
        const project = opts.projectId ? await ctx.fns.projects.get({ projectId: opts.projectId }) : null;
        if (opts.projectId && !project) return { error: 'Project not found' };
        const workspaceDir = project ? project.dir : await ctx.fns.workspace.normalize({ dir: requestedWorkspace, create: opts.createWorkspaceDir === '1' });
        const model = String(opts.model ?? '').trim() || (await ctx.fns.settings.modelDefault({})) || ctx.env.MODEL || 'claude-code:claude-opus-5';
        const presets = await ctx.fns.agent.listPromptPresets({});
        const ids = (Array.isArray(opts.promptPreset) ? opts.promptPreset : opts.promptPreset ? [opts.promptPreset] : []) as (keyof typeof presets)[];
        const presetText = ids.filter(id => Object.prototype.hasOwnProperty.call(presets, id)).map(id => presets[id].text.trim()).filter(Boolean).join('\n\n');
        const systemPrompt = [presetText, String(opts.systemPrompt ?? '').trim()].filter(Boolean).join('\n\n');
        const created = await ctx.fns.agent.start({ model, title: String(opts.title ?? '').trim().slice(0, 120), workspaceDir, workspaceHost: project?.host || '', systemPrompt });
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", params: [model] }).catch(() => {});
        return { agent: created };
    } catch (error: any) {
        if (!opts.projectId && opts.createWorkspaceDir !== '1' && String(error?.message ?? '').startsWith('workspace directory not found:')) return { confirmation: { dir: resolve(requestedWorkspace.trim() || process.cwd()), values: opts } };
        return { error: String(error?.message ?? 'Invalid workspace') };
    }
}
