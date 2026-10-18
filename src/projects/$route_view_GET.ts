/** Restore a project's persisted active tab on default navigation without writes; use list=1 for its index or archive=1 for its archive. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming project page request. */ req: Request;
}): Promise<Response | {title:string;main:string;status?:number}> {
    const url = new URL(opts.req.url);
    const projectId = url.searchParams.get('projectId') || '';
    const project = await ctx.fns.projects.get({projectId});
    if (!project) return {title:'Project not found',main:'<section class="project-page"><h1>Project not found</h1></section>',status:404};
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
    const chats = await ctx.fns.projects.chats({projectId,archived});
    const esc = (text:string) => ctx.fns.procs.ui.escape({text});
    const root = '/projects/view?projectId='+encodeURIComponent(projectId);
    const items = await ctx.fns.nav.chatItems({agents:chats});
    const pinned = new Set([...(await ctx.fns.auth.pinnedIds({}))].map(id => 'agent:'+id));
    // Native rows preserve model icons, running/unread state and pin controls.
    const rows = (await Promise.all(items.map(async (item, index) => '<div class="flex items-center gap-2"><div class="min-w-0 flex-1">'+await ctx.fns.nav.rows({items:[item],compact:true,pinned})+'</div>'+ctx.fns.procs.ui.button({action:archived?'project-restore-chat':'project-archive-chat',label:archived?'Restore':'Archive',tone:'ghost',attrs:{'data-project-action':archived?'restore':'archive','data-chat-id':chats[index]!.id}})+'</div>'))).join('');
    const create = ctx.fns.ui.popup({method:'ui.newAgentPopup',params:{projectId},html:'<i class="ph ph-plus" aria-hidden="true"></i> New chat',tone:'primary',attrs:'aria-label="New chat"'});
    const projectArchive = ctx.fns.procs.ui.button({label:project.archived?'Restore project':'Archive project',tone:'ghost',attrs:{'data-project-action':project.archived?'restore-project':'archive-project','data-project-id':projectId}});
    return {title:project.title,main:'<section class="project-page" hx-boost="true" hx-target="#main" data-project-id="'+esc(projectId)+'"><h1>'+esc(project.title)+(archived?' · Archive':'')+'</h1><p class="text-muted">'+esc((project.host ? project.host+':' : '')+project.dir)+'</p><div class="flex gap-4 my-4">'+create+projectArchive+'<a href="'+root+(archived?'&list=1':'&archive=1')+'" hx-get="'+root+(archived?'&list=1':'&archive=1')+'" hx-target="#main" hx-push-url="true">'+(archived?'Active chats':'Archive')+'</a></div>'+ (rows || '<p class="text-muted">'+(archived?'No archived chats.':'No chats yet. Create an independent chat in this project.')+'</p>')+'</section>'};
}
