/**
 * Prepend project chat tabs to an agent page while retaining the direct chat and canvas surface.
 *
 * Wrap agent route HTML for full and HTMX requests. Embedded and sidebar presentations remain navigation-free. Only lightweight project summaries are read.
 * @param opts.main Trusted agent page markup.
 * @param opts.path HTTP route path selecting the current agent.
 * @param opts.currentId Active agent identifier supplied by its route.
 * @param opts.title Page title passed through the module layout seam.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted agent page markup. */
        main: string;
        /** HTTP route path selecting the current agent. */
        path: string;
        /** Active agent identifier supplied by its route. */
        currentId?: string;
        /** Page title passed through the module layout seam. */
        title?: string;
    },
): Promise<string> {
    if(session?.url?.searchParams.get('embed')==='1' || session?.url?.searchParams.get('presentation')==='sidebar') return opts.main;
    const agentId=opts.currentId || /^\/agent\/([^/]+)$/.exec(opts.path)?.[1];
    if(!agentId) return opts.main;
    const chrome=await ctx.fns.projects.navigation({agentId});
    return '<div id="project-tabs-host">'+chrome.tabs+'</div>'+opts.main;
}
