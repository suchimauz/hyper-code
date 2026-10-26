/** Restore a project's persisted active tab on default navigation without writes; use list=1 for its index or archive=1 for its archive. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming project page request. */ req: Request;
}): Promise<Response | {title:string;main:string;status?:number}> {
    const url = new URL(opts.req.url);
    const projectId = url.searchParams.get('projectId') || '';
    const project = await ctx.fns.projects.get({projectId});
    if (!project) return {title:'Проект не найден',main:'<section class="project-page"><h1>Проект не найден</h1></section>',status:404};
    const archived = url.searchParams.get('archive') === '1';
    if (!archived && url.searchParams.get('list') !== '1') {
        const tabs = await ctx.fns.projects.tabs({projectId});
        if (tabs.activeId) {
            const location='/agent/'+encodeURIComponent(tabs.activeId);
            // HTMX consumes location on a 200; a normal navigation receives an HTTP redirect.
            if (opts.req.headers.get('HX-Request') === 'true') return new Response(null,{status:200,headers:{'HX-Location':JSON.stringify({path:location,target:'#main'}),'Cache-Control':'no-store'}});
            return new Response(null,{status:302,headers:{Location:location,'Cache-Control':'no-store'}});
        }
    }
    const [activeChats, archivedChats, tabs] = await Promise.all([
        ctx.fns.projects.chats({projectId}),
        ctx.fns.projects.chats({projectId,archived:true}),
        ctx.fns.projects.tabs({projectId}),
    ]);
    return {title:project.title,main:await ctx.fns.projects.renderPage({project,chats:archived?archivedChats:activeChats,archived,tabIds:tabs.tabIds,activeCount:activeChats.length,archiveCount:archivedChats.length})};
}
