/**
 * Serve owner-only isolated input documents and pending input metadata
 *
 * Use from React to host existing input cards with their original secure transports. GET only; never submits or grants approval. Lists no specs, results or credentials.
 * @param opts.req Authenticated same-origin browser GET request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated same-origin browser GET request. */
        req: Request;
    },
): Promise<Response> {
    const req=opts.req,url=new URL(req.url);
    const headers={'cache-control':'no-store','vary':'Cookie','referrer-policy':'no-referrer','x-frame-options':'SAMEORIGIN','content-security-policy':"frame-ancestors 'self'; base-uri 'none'"};
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user||user.role!=='owner')return new Response('Owner access required',{status:403,headers});
    if(req.method!=='GET')return new Response('GET required',{status:405,headers});
    if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.get('origin')&&req.headers.get('origin')!==url.origin))return new Response('Same origin required',{status:403,headers});
    const agentId=url.searchParams.get('agentId')||'';
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(agentId))return new Response('Invalid agent',{status:400,headers});
    const kinds=['grid','secret','redmine-approval','redmine-time','redmine-time-review','sber-login','tbank-login'];
    const rows=await ctx.fns.procs.db.select({sql:"SELECT i.id,i.kind,i.title FROM inputs i JOIN agents a ON a.id=i.agent_id WHERE i.agent_id=? AND a.archived_at IS NULL AND i.state IN ('open','processing') ORDER BY i.created_at",params:[agentId]});
    const inputs=(rows as {id:string;kind:string;title:string}[]).filter(r=>kinds.includes(r.kind)).map(r=>({id:r.id,kind:r.kind,title:r.title}));
    const id=url.searchParams.get('id');
    if(!id)return Response.json({inputs},{headers});
    if(!inputs.some(i=>i.id===id))return new Response('Input unavailable',{status:404,headers});
    const csrf=await ctx.fns.auth.csrfToken({req});
    if(!csrf)return new Response('Browser session required',{status:403,headers});
    const esc=(v:string)=>Bun.escapeHTML(v);
    const styles=((ctx.state as {procs?:{styles?:{href:string}[]}}).procs?.styles??[]).map((s:{href:string})=>'<link rel="stylesheet" href="'+esc(s.href)+'">').join('');
    const theme=url.searchParams.get('theme')==='dark'?'dark':'light';
    const card=await ctx.fns.input.card({id});
    return new Response('<!doctype html><html lang="ru" data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="'+esc(csrf)+'"><title>Защищённая форма</title><script src="/procs/ui/htmx.js" defer></script><link rel="stylesheet" href="/ui/vendor/phosphor.css"><link rel="stylesheet" href="/ui/vendor/medeo.css">'+styles+'</head><body><main>'+card+'</main></body></html>',{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
}
