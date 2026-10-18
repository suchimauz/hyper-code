/** Apply one explicit project or personal tab action; creating a chat never forks an existing agent. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming JSON action request bound to the authenticated principal. */ req: Request;
}): Promise<Response> {
    if (!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token') || ''})) return Response.json({ok:false,error:'Invalid request token. Reload the page and retry.'},{status:403});
    try {
        const data = await opts.req.json() as {action?:string;projectId?:string;agentId?:string;dir?:string;host?:string;title?:string};
        if (data.action === 'create') {
            if (!data.dir || typeof data.dir !== 'string') throw new Error('An absolute project directory is required');
            const p = await ctx.fns.projects.create({dir:data.dir,host:data.host || '',title:data.title || undefined});
            return Response.json({ok:true,url:'/projects/view?projectId='+encodeURIComponent(p.id)});
        }
        const selected = data.agentId && data.action === 'select' ? await ctx.fns.projects.resolve({agentId:data.agentId}) : data.projectId ? await ctx.fns.projects.get({projectId:data.projectId}) : null;
        if (!selected) {
            if (data.action === 'select') return Response.json({ok:true});
            throw new Error('Project not found');
        }
        const projectId = selected.id;
        if (data.action === 'archive-project' || data.action === 'restore-project') {
            await ctx.fns.projects.setArchived({projectId,archived:data.action === 'archive-project'});
            return Response.json({ok:true});
        }
        if (data.action === 'select') {
            await ctx.fns.projects.open({projectId,agentId:data.agentId});
            return Response.json({ok:true});
        }
        if (data.action === 'new-chat') {
            return Response.json({ok:false,error:'Open the new-agent popup and submit the creation form.'},{status:400});
        }
        if (data.action === 'close' && data.agentId) {
            const tabs = await ctx.fns.projects.closeTab({projectId,agentId:data.agentId});
            const fallbackUrl = tabs.activeId ? '/agent/'+encodeURIComponent(tabs.activeId) : '/projects/view?projectId='+encodeURIComponent(projectId);
            return Response.json({ok:true,fallbackUrl});
        }
        throw new Error('Unsupported project action');
    } catch (error) {
        return Response.json({ok:false,error:error instanceof Error ? error.message : String(error)}, {status:400});
    }
}
