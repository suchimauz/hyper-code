/** Redirect authorized legacy project links into React navigation, restoring a persisted active chat only on default navigation. No project or tab data is changed. */
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
    const location = '/?workspaceProject=' + encodeURIComponent(project.id) + '&workspaceFilter=' + (archived || project.archived ? 'archived' : 'active');
    return new Response(null, {status:302, headers:{Location:location, 'Cache-Control':'no-store'}});
}
