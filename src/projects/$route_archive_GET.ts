/** List the current viewer's archived projects with native navigation rows and explicit restore controls. */
export default async function(ctx: Context, session: Session | null, opts: {
 /** Incoming archive page request. */ req: Request;
}): Promise<{title:string;main:string}> {
 const projects=(await ctx.fns.projects.list({})).filter(p=>p.archived);
 return {title:'Архив проектов',main:await ctx.fns.projects.renderPage({projects})};
}
