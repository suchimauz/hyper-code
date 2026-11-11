/**
 * Render an isolated secret field that saves directly to the dedicated CSRF-protected batch transport.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.req Authorized browser request for an isolated secret field.
 * @param opts.id Parent batch identifier.
 * @param opts.key Secret member key.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authorized browser request for an isolated secret field. */
        req: Request;
        /** Parent batch identifier. */
        id: string;
        /** Secret member key. */
        key: string;
    },
): Promise<Response> {
    const input=await ctx.fns.input.get({id:opts.id});const item=input?.spec.items.find((i:any)=>i.key===opts.key);
    if(!input||input.kind!=='batch'||input.state!=='open'||item?.kind!=='secret')return new Response('Field unavailable',{status:404});
    const snap=await ctx.fns.input.batchSnapshot({id:opts.id});const filled=(snap.items as any[]).find(i=>i.key===opts.key)?.filled===true;
    const token=await ctx.fns.auth.csrfToken({req:opts.req});
    const config=JSON.stringify({id:opts.id,key:opts.key,revision:snap.revision,filled,token}).replace(/</g,'\\u003c');
    const theme=new URL(opts.req.url).searchParams.get('theme');
    const nonce=crypto.randomUUID();const hold=filled?'Сохранено — оставьте пустым':'';const extra=item.spec.mode==='otp'?`class="otp" inputmode="numeric" placeholder="${hold||'123456'}"`:`placeholder="${hold||(item.spec.mode==='text'?'':'••••••••')}"`;const esc=(s:unknown)=>Bun.escapeHTML(String(s??''));
    const html=`<!doctype html><html lang="ru" data-theme="${theme==='dark'||theme==='light'?theme:'system'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui/vendor/tokens.css"><style>html,body{margin:0;padding:0;background:var(--surface);color:var(--text);font-family:var(--font-sans)}body{padding:2px}input{display:block;width:100%;box-sizing:border-box;min-height:42px;padding:10px 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;line-height:20px}input::placeholder{color:var(--text-caption)}input:focus{outline:2px solid var(--focus-ring);outline-offset:0}input.otp{font-family:var(--font-mono);letter-spacing:.3em}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}</style></head><body><input id="value" aria-label="${esc(item.title)}" type="${item.spec.mode==='text'?'text':'password'}" maxlength="${Number(item.spec.maxlength)}" ${extra} autocomplete="${item.spec.mode==='otp'?'one-time-code':'new-password'}"><p id="status" class="sr" aria-live="polite"></p><script nonce="${nonce}">
    const c=${config};const field=document.getElementById('value'),status=document.getElementById('status');let busy=false;
    const send=(state,extra={})=>parent.postMessage({source:'mauzcode-batch-secret',id:c.id,key:c.key,state,...extra},location.origin);
    addEventListener('message',async e=>{const d=e.data;if(e.source!==parent||e.origin!==location.origin||!d||d.target!=='mauzcode-batch-secret'||d.id!==c.id||d.key!==c.key)return;if(d.action==='focus'){field.focus();return;}if(d.action!=='save'||busy)return;c.revision=d.revision;if(!field.value&&c.filled){send('saved',{filled:true,revision:c.revision});return;}busy=true;let value=field.value;field.value='';try{const response=await fetch('/input/batch/'+encodeURIComponent(c.id)+'/secret',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':c.token},body:JSON.stringify({key:c.key,revision:c.revision,value})});value='';const result=await response.json();if(!response.ok)throw new Error();c.filled=true;c.revision=result.revision;status.textContent='Черновик сохранён';send('saved',{filled:true,revision:result.revision});}catch{status.textContent='Не удалось сохранить, введите значение ещё раз';send('error',{error:'Could not save the secret draft'});}finally{value='';busy=false;}});send('ready',{filled:c.filled,revision:c.revision});
    </script></body></html>`;
    return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`,'referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
}
