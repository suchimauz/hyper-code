export const hint = 'Read-only OpenSpec view of a local workspace (changes with task progress, specs, archive, strict validation); args { dir } pin the absolute local workspace directory to this tab.';
export default {
    icon: 'list-checks',
    async prepare(ctx: Context, opts: { agentId: string; args: Record<string, unknown> }) {
        const rows = await ctx.fns.procs.db.select({ sql: 'SELECT workspace_dir, workspace_host FROM agents WHERE id = ?', params: [opts.agentId] });
        const host = String(rows[0]?.workspace_host ?? '').trim();
        if (host && host !== 'local') throw new Error('OpenSpec is available only for local workspaces; this workspace is on SSH host ' + host);
        const dir = String(opts.args.dir ?? rows[0]?.workspace_dir ?? '');
        if (!dir.startsWith('/') || dir.includes('\0')) throw new Error('OpenSpec needs an absolute local workspace directory');
        return { args: { dir }, title: 'OpenSpec · ' + (dir.split('/').filter(Boolean).pop() || dir) };
    },
    render() { return '<p>OpenSpec is available in the React Canvas view. Enable the OpenSpec plugin UI to inspect this workspace.</p>'; },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) { return `OpenSpec ${opts.item.args.dir}/.mauzcode/openspec`; },
} satisfies types.canvas.Kind;
