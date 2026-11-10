export const hint = 'Read-only project Git changes and HEAD history; args { dir, host: "local" | SSH alias } pin the repository to this tab.';
export default {
    icon: 'git-branch',
    async prepare(ctx: Context, opts: {agentId:string;args:Record<string, unknown>}) {
        const rows = await ctx.fns.procs.db.select({sql:'SELECT workspace_dir, workspace_host FROM agents WHERE id = ?',params:[opts.agentId]});
        const dir=String(opts.args.dir ?? rows[0]?.workspace_dir ?? '');
        const host=String(opts.args.host ?? rows[0]?.workspace_host ?? '') || 'local';
        if(!dir.startsWith('/') || dir.includes('\0') || !/^[A-Za-z0-9_.-]+$/.test(host))throw new Error('Invalid pinned repository');
        return {args:{dir,host},title:'Git · '+(dir.split('/').filter(Boolean).pop()||dir)};
    },
    render(){return '<p>Git is available in the React Canvas view. Enable the Git plugin UI to inspect this repository.</p>';},
    describe(_ctx:Context,opts:{item:types.canvas.Item}) {return `Git ${opts.item.args.host}:${opts.item.args.dir}`;}
} satisfies types.canvas.Kind;
