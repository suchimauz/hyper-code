/** Serve authenticated UI projections and the CSRF-protected local directory picker for React. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming browser request; fixed projection GET paths and directory GET/POST are accepted. */ req: Request;
}): Promise<Response> {
    const headers = {'Cache-Control':'no-store','Vary':'Cookie'};
    if (!(session as Session & {user?: {id:string}})?.user) return Response.json({error:'Unauthorized'}, {status:401,headers});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/choices') return ctx.fns.frontendBridge.choices({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/confirms') return ctx.fns.frontendBridge.confirms({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/project-icon') return ctx.fns.frontendBridge.projectIcon({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/project-action') return ctx.fns.frontendBridge.projectAction({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/chat-header') return ctx.fns.frontendBridge.chatHeader({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/new-session') return ctx.fns.frontendBridge.newSession({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/directories') return ctx.fns.frontendBridge.directories({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/ssh-instances') return ctx.fns.frontendBridge.sshInstances({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/plugins') return ctx.fns.frontendBridge.pluginsData({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/cron-tasks') return ctx.fns.frontendBridge.cronTasks({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/llm-connections') return ctx.fns.frontendBridge.llmConnections({req:opts.req});
    if (new URL(opts.req.url).pathname === '/ui-lab-api/provider-icons') return ctx.fns.frontendBridge.providerIcons({req:opts.req});
    if (opts.req.method !== 'GET') return Response.json({error:'Method not allowed'}, {status:405,headers:{...headers,Allow:'GET'}});
    const url = new URL(opts.req.url);
    try {
        if (url.pathname === '/ui-lab-api/stats') {
            const range=url.searchParams.get('range')??'all', timezone=url.searchParams.get('timezone')??'UTC';
            if (!['all','30d','7d'].includes(range) || timezone.length>100 || url.searchParams.getAll('range').length>1 || url.searchParams.getAll('timezone').length>1) return Response.json({error:'Invalid stats parameters'},{status:400,headers});
            try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch { return Response.json({error:'Invalid stats parameters'},{status:400,headers}); }
            return Response.json(await ctx.fns.frontendBridge.statsData({range:range as 'all'|'30d'|'7d',timezone}),{headers});
        }
        if (url.pathname === '/ui-lab-api/navigation') return Response.json(await ctx.fns.frontendBridge.navigationData({}), {headers});
        if (url.pathname === '/ui-lab-api/search') {
            const q=url.searchParams.get('q')??'',tab=url.searchParams.get('tab')??'';
            if(q.length>500||tab.length>100)return Response.json({error:'Query too long'},{status:400,headers});
            return Response.json(await ctx.fns.frontendBridge.searchData({q,tab}), {headers});
        }
        if (url.pathname === '/ui-lab-api/models') {
            const ids = url.searchParams.getAll('agentId');
            if (ids.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(ids[0]!)) return Response.json({error:'Invalid agentId'},{status:400,headers});
            return Response.json(await ctx.fns.frontendBridge.modelData({agentId:ids[0]!}), {headers});
        }
        return Response.json({error:'Not found'}, {status:404,headers});
    } catch (error) {
        if (error instanceof Error && error.message === 'Agent not found') return Response.json({error:'Agent not found'},{status:404,headers});
        console.error('UI navigation request failed:',error instanceof Error?error.message:String(error));
        return Response.json({error:'Не удалось загрузить навигацию Hyper'}, {status:500,headers});
    }
}
