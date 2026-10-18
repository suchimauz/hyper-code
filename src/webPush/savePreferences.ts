/**
 * Save authenticated owner choices for main-agent push notifications
 *
 * Handles the Inspector form POST. Verifies active cookie-bound identity, same origin and CSRF, validates form fields, and atomically writes only for an eligible agent owned by the authenticated user. No recipient identity is accepted from the browser.
 * @param opts.req Incoming form POST with authentication cookie and CSRF token.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming form POST with authentication cookie and CSRF token. */
        req: Request;
    },
): Promise<Response> {
    const req = opts.req;
    const fail = (error:string,status:number) => Response.json({error},{status,headers:{'cache-control':'no-store'}});
    const owner = session?.user?.id;
    if (!owner) return fail('Authentication required',401);
    const raw = new Bun.CookieMap(req.headers.get('cookie') ?? '').get(ctx.fns.procs.auth.cookieName({}));
    const binding = raw ? await ctx.fns.webPush.sessionBinding({token:raw}) : null;
    if (!binding || binding.ownerId !== owner || !Number.isFinite(binding.expiresAt) || binding.expiresAt <= Date.now()) return fail('Authentication required',401);
    const origin = await ctx.fns.http.publicOrigin({req});
    if (req.method !== 'POST' || req.headers.get('origin') !== origin) return fail('Invalid request origin',403);
    if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return fail('Form required',415);
    const reader=req.body?.getReader(); if(!reader) return fail('Body required',400);
    let text=''; let size=0; const decoder=new TextDecoder();
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();return fail('Body too large',413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
    const form = new URLSearchParams(text);
    if ([...form.keys()].some(k=>!['agentId','csrf','input','error'].includes(k) || form.getAll(k).length!==1)) return fail('Invalid fields',400);
    const agentId=form.get('agentId');
    if (!agentId || agentId.length>200 || ['input','error'].some(k=>form.has(k)&&form.get(k)!=='true')) return fail('Invalid preferences',400);
    if (!await ctx.fns.auth.verifyCsrf({req,token:form.get('csrf') ?? ''})) return fail('Invalid CSRF token',403);
    const saved = await ctx.fns.procs.db.select({sql:"INSERT INTO web_push_preferences (agent_id,owner_id,input_enabled,error_enabled,updated_at) SELECT a.id,a.created_by,?,?,? FROM agents a JOIN users u ON u.id=a.created_by WHERE a.id=? AND a.created_by=? AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND a.archived_at IS NULL AND u.disabled_at IS NULL ON CONFLICT (agent_id,owner_id) DO UPDATE SET input_enabled=EXCLUDED.input_enabled,error_enabled=EXCLUDED.error_enabled,updated_at=EXCLUDED.updated_at RETURNING agent_id",params:[form.has('input'),form.has('error'),Date.now(),agentId,owner]});
    if (!saved.length) return fail('Agent unavailable',403);
    const html=await ctx.fns.webPush.settingsHtml({agentId});
    return new Response(html.replace('</form>', '<p role="status" class="text-xs">Notification preferences saved.</p></form>'),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
