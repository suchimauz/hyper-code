/** List the current viewer's archived projects with native navigation rows and explicit restore controls. */
export default async function(ctx: Context, session: Session | null, opts: {
 /** Incoming archive page request. */ req: Request;
}): Promise<{title:string;main:string}> {
 const projects=(await ctx.fns.projects.list({})).filter(p=>p.archived);
 const rows=await Promise.all(projects.map(async p=>'<div class="flex items-center gap-2">'+
 '<div class="min-w-0 flex-1">'+await ctx.fns.nav.rows({items:[{id:'project:'+p.id,label:p.title,href:'/projects/view?projectId='+encodeURIComponent(p.id)+'&list=1',icon:'ph-folder',hint:(p.host?p.host+':':'')+p.dir}],compact:true,pinned:new Set<string>()})+'</div>'+
 ctx.fns.procs.ui.button({label:'Restore',tone:'ghost',attrs:{'data-project-action':'restore-project','data-project-id':p.id}})+'</div>'));
 return {title:'Archived projects',main:'<section class="project-page" hx-boost="true" hx-target="#main"><h1>Archived projects</h1><p class="text-muted">Archiving a project hides it from navigation. Its chats and running agents are unchanged.</p>'+ (rows.join('')||'<p class="text-muted">No archived projects.</p>')+'</section>'};
}
