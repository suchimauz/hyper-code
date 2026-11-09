/**
 * Read and update authenticated owner Meta settings
 *
 * Native JSON boundary for plan display, prompt injection and context thresholds. Writes require cookie-bound CSRF and never activate plan tasks.
 * @param opts.req Incoming HTTP request.
 * @param opts.id Exact target agent identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming HTTP request. */
        req: Request;
        /** Exact target agent identifier. */
        id: string;
    },
): Promise<Response> {
    try {
     await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId:opts.id});
     if(opts.req.method==='POST') {
      if(!opts.req.headers.get('content-type')?.includes('application/json')) return Response.json({message:'JSON required'},{status:415});
      await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId:opts.id,csrfToken:opts.req.headers.get('X-CSRF-Token')??''});
      const raw:unknown=await opts.req.json();
      if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('Object required');
      const b=raw as Record<string,unknown>;
      if(b.action==='status') {
       if(Object.keys(b).some(k=>!['action','mode','text','every'].includes(k))||(b.mode!=='global'&&b.mode!=='custom'&&b.mode!=='off')||typeof b.text!=='string'||b.text.length>500||typeof b.every!=='number'||!Number.isInteger(b.every)||b.every<1||b.every>100) throw new Error('Invalid prompt injection settings');
       await ctx.fns.agent.setStatusLine({id:opts.id,text:b.text,every:b.every,mode:b.mode});
      } else if(b.action==='context') {
       if(Object.keys(b).some(k=>!['action','percent'].includes(k))||(b.percent!==null&&typeof b.percent!=='number')) throw new Error('Invalid context settings');
       await ctx.fns.agent.setCompaction({id:opts.id,percent:b.percent});
      } else throw new Error('Unknown action');
     } else if(opts.req.method!=='GET') return Response.json({message:'Method not allowed'},{status:405});
     const rows=await ctx.fns.procs.db.select({sql:'SELECT status_line,status_line_every,status_line_mode,auto_compact_window_percent,run_state FROM agents WHERE id=?',params:[opts.id]});
     const target=ctx.state.agent[opts.id]??await ctx.fns.session.load({id:opts.id});
     return Response.json({settings:rows[0],plan:target?.scratchpad?.plan??null,csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'Cache-Control':'no-store'}});
    } catch(error) {const e=error as Error & {status?:number}; return Response.json({message:e.status?e.message:(opts.req.method==='POST'?e.message:'Meta unavailable')},{status:e.status??400,headers:{'Cache-Control':'no-store'}});}
}
