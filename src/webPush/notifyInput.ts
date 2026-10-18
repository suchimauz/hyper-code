/**
 * Send an action-needed push identifying the project and agent to its active owner.
 *
 * Internal input hook with durable at-most-once claims. At most ten parallel sends, five-second timeout, no retries. Claims can be lost on crash. No form contents enter payloads.
 * @param opts.inputId Persisted open input ID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Persisted open input ID. */
        inputId: string;
    },
): Promise<void> {
    const rows=await ctx.fns.procs.db.select({sql:"SELECT i.agent_id,a.created_by,a.title,a.workspace_dir,a.workspace_host FROM inputs i JOIN agents a ON a.id=i.agent_id JOIN users u ON u.id=a.created_by WHERE i.id=? AND i.state='open' AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND NOT EXISTS (SELECT 1 FROM web_push_preferences p WHERE p.agent_id=a.id AND p.owner_id=a.created_by AND p.input_enabled=false) AND a.archived_at IS NULL AND u.disabled_at IS NULL",params:[opts.inputId]});
    if(!rows.length)return;const row=rows[0];const user=session?.user?.id,caller=session?.agent?.id??session?.agentId;
    if(user&&user!==row.created_by)return;if(caller){const a=await ctx.fns.procs.db.select({sql:'SELECT created_by FROM agents WHERE id=?',params:[caller]});if(a[0]?.created_by!==row.created_by)return;}if(!user&&!caller)return;
    const preferences = await ctx.fns.webPush.preferences({agentId:String(row.agent_id)});
    if (!preferences.eligible || !preferences.input) return;
    const subs=await ctx.fns.procs.db.select({sql:'SELECT id,endpoint,p256dh,auth FROM web_push_subscriptions WHERE owner_id=? AND expires_at>? LIMIT 10',params:[row.created_by,Date.now()]});if(!subs.length)return;
    const keys=await ctx.fns.webPush.vapid({}),wp=await import('web-push');
    const label = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const agentName = label(row.title) || `Агент ${row.agent_id}`;
    let projectName = '';
    if (typeof row.workspace_dir === 'string' && row.workspace_dir.startsWith('/')) {
        const identity = await ctx.fns.projects.identity({dir:row.workspace_dir,host:row.workspace_host ?? ''});
        // Use the recipient's personal project label, not the calling HTTP viewer's.
        const projects = await ctx.fns.procs.db.select({sql:'SELECT title FROM project_members WHERE project_id=? AND principal=?',params:[identity.id,'user:'+row.created_by]});
        projectName = label(projects[0]?.title) || label(identity.dir.split('/').filter(Boolean).pop());
    }
    const payload=JSON.stringify({type:'input',projectName,agentName,url:'/a/'+encodeURIComponent(String(row.agent_id)),tag:'input-'+opts.inputId});
    await Promise.all(subs.map(async sub=>{let stage = 'validate'; try{
    const subscription=await ctx.fns.webPush.validateSubscription({subscription:{endpoint:String(sub.endpoint),keys:{p256dh:String(sub.p256dh),auth:String(sub.auth)}}});
    const preferencesNow = await ctx.fns.webPush.preferences({agentId:String(row.agent_id)});
    if (!preferencesNow.eligible || !preferencesNow.input) return;
    const claim=await ctx.fns.procs.db.select({sql:"INSERT INTO web_push_deliveries(input_id,subscription_id,attempted_at) SELECT i.id,s.id,? FROM inputs i JOIN agents a ON a.id=i.agent_id JOIN users u ON u.id=a.created_by JOIN web_push_subscriptions s ON s.owner_id=u.id LEFT JOIN auth_sessions login ON login.id=s.session_id WHERE i.id=? AND s.id=? AND i.state='open' AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND NOT EXISTS (SELECT 1 FROM web_push_preferences p WHERE p.agent_id=a.id AND p.owner_id=a.created_by AND p.input_enabled=false) AND a.archived_at IS NULL AND u.disabled_at IS NULL AND s.expires_at>? AND (s.session_id IS NULL OR (login.revoked_at IS NULL AND login.expires_at>? AND login.user_id=u.id)) ON CONFLICT DO NOTHING RETURNING input_id",params:[Date.now(),opts.inputId,sub.id,Date.now(),Date.now()]});if(!claim.length)return;
    stage = 'request-generation';
    const details=wp.generateRequestDetails(subscription,payload,{TTL:60,urgency:'normal',vapidDetails:{subject:keys.subject,publicKey:keys.publicKey,privateKey:keys.privateKey}});
    stage = 'transport';
    const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(5000)});await response.body?.cancel();
    if (!response.ok) ctx.fns.procs.log?.warn?.({event:'web-push.delivery.failed',msg:'Push provider rejected request',inputId:opts.inputId,stage:'provider',status:response.status});
    if(response.status===404||response.status===410){await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE id=?',params:[sub.id]});return;}
    await ctx.fns.procs.db.run({sql:'UPDATE web_push_deliveries SET status=? WHERE input_id=? AND subscription_id=?',params:[response.ok?'sent':'failed',opts.inputId,sub.id]});
    }catch(error){
    // Never log exception messages, endpoint URLs, response bodies or signing keys.
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'operation-failed';
    ctx.fns.procs.log?.warn?.({event:'web-push.delivery.failed',msg:'Push delivery failed',inputId:opts.inputId,stage,reason});
    await ctx.fns.procs.db.run({sql:"UPDATE web_push_deliveries SET status='failed' WHERE input_id=? AND subscription_id=?",params:[opts.inputId,sub.id]}).catch(()=>undefined);}}));
}
