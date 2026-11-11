/**
 * Serve owner-only isolated input documents and pending input metadata
 *
 * Use from React to host existing input cards with their original secure transports. GET only; never submits or grants approval. Metadata lists no results or credentials; secret entries add only their public message, target reference and mode for the native card. With view=field a secret renders just its isolated value field.
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
    const rows=await ctx.fns.procs.db.select({sql:"SELECT i.id,i.kind,i.title FROM inputs i JOIN agents a ON a.id=i.agent_id WHERE i.agent_id=? AND a.archived_at IS NULL AND i.state IN ('open','processing') ORDER BY i.created_at",params:[agentId]});
    const inputs=(rows as {id:string;kind:string;title:string}[]).map(r=>({id:r.id,kind:r.kind,title:r.title}));
    const id=url.searchParams.get('id');
    if(!id){
        // Secret cards render natively in React: they need the public message, target reference and mode, never a value.
        const listed=await Promise.all(inputs.map(async i=>{
            if(i.kind!=='secret')return i;
            const row=await ctx.fns.input.get({id:i.id});
            return row?{...i,message:row.message||'',saveAs:String(row.spec?.saveAs??''),mode:String(row.spec?.mode??'password')}:i;
        }));
        return Response.json({inputs:listed},{headers});
    }
    if(!inputs.some(i=>i.id===id))return new Response('Input unavailable',{status:404,headers});
    const csrf=await ctx.fns.auth.csrfToken({req});
    if(!csrf)return new Response('Browser session required',{status:403,headers});
    const esc=(v:string)=>Bun.escapeHTML(v);
    const styles=((ctx.state as {procs?:{styles?:{href:string}[]}}).procs?.styles??[]).map((s:{href:string})=>'<link rel="stylesheet" href="'+esc(s.href)+'">').join('');
    const theme=url.searchParams.get('theme')==='dark'?'dark':'light';
    const target=inputs.find(i=>i.id===id)!;
    if(url.searchParams.get('view')==='field'&&target.kind==='secret'){
        const row=await ctx.fns.input.get({id});
        if(!row)return new Response('Input unavailable',{status:404,headers});
        return new Response(secretField(row,csrf,theme),{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
    }
    const card=await ctx.fns.input.card({id});
    return new Response('<!doctype html><html lang="ru" data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="'+esc(csrf)+'"><title>Защищённая форма</title><script src="/procs/ui/htmx.js" defer></script><link rel="stylesheet" href="/ui/vendor/phosphor.css"><link rel="stylesheet" href="/ui/vendor/medeo.css">'+styles+'</head><body><main>'+card+'</main></body></html>',{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
}

/**
 * The only part of a secret card that stays isolated: one field plus its submit transport.
 * The React card drives it through same-origin postMessage (submit/cancel/focus) and receives
 * only state and error text back — the typed value never leaves this document except in the POST.
 */
function secretField(row:types.input.Row,csrf:string,theme:string):string{
    const esc=(v:unknown)=>Bun.escapeHTML(String(v));
    const json=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c');
    const mode=['password','otp','text'].includes(row.spec?.mode)?row.spec.mode:'password';
    const max=Math.max(1,Math.min(Number(row.spec?.maxlength)||256,4096));
    const attrs=mode==='otp'?'inputmode="numeric" autocomplete="one-time-code" placeholder="123456" class="otp"':mode==='password'?'autocomplete="new-password" placeholder="••••••••"':'autocomplete="off"';
    const css='html,body{margin:0;padding:0;background:var(--surface);color:var(--text);font-family:var(--font-sans)}'
        +'form{margin:0;padding:2px}'
        +'input{display:block;width:100%;box-sizing:border-box;min-height:42px;padding:10px 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;line-height:20px}'
        +'input::placeholder{color:var(--text-caption)}input:focus{outline:2px solid var(--focus-ring);outline-offset:0}input:disabled{opacity:.6}'
        +'input.otp{font-family:var(--font-mono);letter-spacing:.3em}';
    const script='(()=>{const id='+json(row.id)+',token='+json(csrf)+',mode='+json(mode)+';'
        +'const f=document.getElementById("f"),v=f.elements.value;let busy=false;'
        +'const tell=m=>parent.postMessage(Object.assign({source:"mauzcode-secret",id},m),location.origin);'
        +'async function send(cancel){if(busy)return;if(!cancel&&!(mode==="password"?v.value:v.value.trim())){tell({state:"open",error:"Введите значение"});v.focus();return}'
        +'busy=true;v.disabled=true;tell({state:"processing"});const body=new FormData();if(cancel)body.set("_action","cancel");else body.set("value",v.value);'
        +'try{const r=await fetch("/input/"+encodeURIComponent(id),{method:"POST",credentials:"same-origin",headers:{"X-CSRF-Token":token,"Accept":"application/json"},body});'
        +'const j=await r.json().catch(()=>({error:"Ошибка "+r.status}));'
        +'if(!r.ok||j.error){busy=false;v.disabled=false;tell({state:"open",error:String(j.error||"Не удалось сохранить")});v.focus();return}'
        +'v.value="";tell({state:j.state})}catch(e){busy=false;v.disabled=false;tell({state:"open",error:"Сеть недоступна, попробуйте ещё раз"})}}'
        +'f.addEventListener("submit",e=>{e.preventDefault();send(false)});'
        +'v.addEventListener("input",()=>tell({state:"open",filled:v.value.length>0}));'
        +'addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==parent)return;const d=e.data||{};if(d.target!=="mauzcode-secret"||d.id!==id)return;'
        +'if(d.action==="submit")send(false);else if(d.action==="cancel")send(true);else if(d.action==="focus")v.focus()});'
        +'tell({state:"ready"})})();';
    return '<!doctype html><html lang="ru" data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Секрет</title>'
        +'<link rel="stylesheet" href="/ui/vendor/medeo.css"><link rel="stylesheet" href="/ui/vendor/tokens.css"><style>'+css+'</style></head>'
        +'<body><form id="f" novalidate><input name="value" type="'+(mode==='text'?'text':'password')+'" maxlength="'+max+'" '+attrs+' aria-label="'+esc(row.title)+'" autofocus></form>'
        +'<script>'+script+'</script></body></html>';
}
