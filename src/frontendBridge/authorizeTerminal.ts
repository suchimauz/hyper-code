/**
 * Authorize an owner-only same-origin UI Lab terminal WebSocket handshake for one local agent workspace
 *
 * Use from the /ui-lab/terminal upgrade hook after global authentication. Requires a signed-in owner, a GET handshake on exactly /ui-lab/terminal, an Origin equal to the public origin, the hyper-terminal subprotocol, a valid agentId query parameter and integer cols/rows in range. The agent must exist with a local workspace (empty workspace_host) whose directory exists; remote SSH workspaces are refused. Returns the terminal start parameters or a refusal Response; it never spawns a process.
 * @param opts.req Incoming browser WebSocket handshake carrying agentId, cols and rows query parameters.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser WebSocket handshake carrying agentId, cols and rows query parameters. */
        req: Request;
    },
): Promise<Response | {agentId: string; cwd: string; cols: number; rows: number}> {
    const {req}=opts;
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user) return new Response('Authentication required',{status:401});
    if(user.role!=='owner') return new Response('Owner access required',{status:403});
    const url=new URL(req.url);
    if(req.method!=='GET' || url.pathname!=='/ui-lab/terminal') return new Response('Invalid endpoint',{status:400});
    const origin=req.headers.get('origin');
    if(!origin || origin!==await ctx.fns.http.publicOrigin({req})) return new Response('Cross-origin WebSocket rejected',{status:403});
    if(req.headers.get('sec-websocket-protocol')!=='hyper-terminal') return new Response('hyper-terminal required',{status:400});
    const agentId=url.searchParams.get('agentId')||'';
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(agentId)) return new Response('Invalid agent',{status:400});
    const size=(name:string,fallback:number,max:number)=>{
        const raw=url.searchParams.get(name);
        if(raw===null) return fallback;
        const n=Number(raw);
        return Number.isInteger(n)&&n>=2&&n<=max?n:NaN;
    };
    const cols=size('cols',80,500),rows=size('rows',24,200);
    if(Number.isNaN(cols)||Number.isNaN(rows)) return new Response('Invalid size',{status:400});
    const row=((await ctx.fns.procs.db.select({sql:'SELECT workspace_dir, workspace_host FROM agents WHERE id = ?',params:[agentId]})) as {workspace_dir?:string|null;workspace_host?:string|null}[])[0];
    if(!row) return new Response('Agent not found',{status:404});
    if(String(row.workspace_host??'').trim()) return new Response('Terminal is available only for local workspaces',{status:409});
    const cwd=String(row.workspace_dir??'').trim();
    if(!cwd.startsWith('/')) return new Response('Workspace directory is not set',{status:409});
    try {
        const {stat}=await import('node:fs/promises');
        if(!(await stat(cwd)).isDirectory()) return new Response('Workspace directory is missing',{status:409});
    } catch { return new Response('Workspace directory is missing',{status:409}); }
    return {agentId,cwd,cols,rows};
}
