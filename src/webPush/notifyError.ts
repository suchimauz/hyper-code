/**
 * Deliver a fixed error notification for a durably recorded terminal main-agent run.
 *
 * Internal worker delivery hook. Requires an existing durable failure identity; honors owner-bound category preferences and active opt-in subscriptions. At-most-once per run and subscription, with a five-second transport timeout and no retries. Never accepts exception contents.
 * @param opts.agentId Agent with a durable terminal failure record.
 * @param opts.runToken Opaque token of the failed owned worker run.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent with a durable terminal failure record. */
        agentId: string;
        /** Opaque token of the failed owned worker run. */
        runToken: string;
    },
): Promise<void> {
    const preferences = await ctx.fns.webPush.preferences({agentId:opts.agentId});
        if (!preferences.eligible || !preferences.error) return;
        const rows = await ctx.fns.procs.db.select({sql:"SELECT a.id AS agent_id,a.created_by,a.title,a.workspace_dir,a.workspace_host FROM web_push_failures f JOIN agents a ON a.id=f.agent_id JOIN users u ON u.id=a.created_by WHERE f.agent_id=? AND f.run_token=? AND a.run_state='idle' AND a.run_token IS NULL AND a.next_run_at IS NULL AND a.wake_at IS NULL AND a.updated_at=f.failed_at AND a.last_error IS NOT NULL AND a.last_error NOT LIKE 'stopped by user%' AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND NOT EXISTS (SELECT 1 FROM web_push_preferences p WHERE p.agent_id=a.id AND p.owner_id=a.created_by AND p.error_enabled=false) AND a.archived_at IS NULL AND u.disabled_at IS NULL",params:[opts.agentId,opts.runToken]});
        if (!rows.length) return;
        const row=rows[0];
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
        const payload=JSON.stringify({type:'error',projectName,agentName,url:'/a/'+encodeURIComponent(String(row.agent_id)),tag:'error-'+opts.runToken});
        await Promise.all(subs.map(async sub=>{let stage = 'validate'; try{
        const subscription=await ctx.fns.webPush.validateSubscription({subscription:{endpoint:String(sub.endpoint),keys:{p256dh:String(sub.p256dh),auth:String(sub.auth)}}});
        const preferencesNow = await ctx.fns.webPush.preferences({agentId:opts.agentId});
        if (!preferencesNow.eligible || !preferencesNow.error) return;
        const claim=await ctx.fns.procs.db.select({sql:"INSERT INTO web_push_error_deliveries(agent_id,run_token,subscription_id,attempted_at) SELECT f.agent_id,f.run_token,s.id,? FROM web_push_failures f JOIN agents a ON a.id=f.agent_id JOIN users u ON u.id=a.created_by JOIN web_push_subscriptions s ON s.owner_id=u.id LEFT JOIN auth_sessions login ON login.id=s.session_id WHERE f.agent_id=? AND f.run_token=? AND s.id=? AND a.run_state='idle' AND a.run_token IS NULL AND a.next_run_at IS NULL AND a.wake_at IS NULL AND a.updated_at=f.failed_at AND a.last_error IS NOT NULL AND a.last_error NOT LIKE 'stopped by user%' AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND NOT EXISTS (SELECT 1 FROM web_push_preferences p WHERE p.agent_id=a.id AND p.owner_id=a.created_by AND p.error_enabled=false) AND a.archived_at IS NULL AND u.disabled_at IS NULL AND s.expires_at>? AND (s.session_id IS NULL OR (login.revoked_at IS NULL AND login.expires_at>? AND login.user_id=u.id)) ON CONFLICT DO NOTHING RETURNING agent_id",params:[Date.now(),opts.agentId,opts.runToken,sub.id,Date.now(),Date.now()]});if(!claim.length)return;
        stage = 'request-generation';
        const details=wp.generateRequestDetails(subscription,payload,{TTL:60,urgency:'normal',vapidDetails:{subject:keys.subject,publicKey:keys.publicKey,privateKey:keys.privateKey}});
        stage = 'transport';
        const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(5000)});await response.body?.cancel();
        if (!response.ok) ctx.fns.procs.log?.warn?.({event:'web-push.delivery.failed',msg:'Push provider rejected request',agentId:opts.agentId,stage:'provider',status:response.status});
        if(response.status===404||response.status===410){await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE id=?',params:[sub.id]});return;}
        await ctx.fns.procs.db.run({sql:'UPDATE web_push_error_deliveries SET status=? WHERE agent_id=? AND run_token=? AND subscription_id=?',params:[response.ok?'sent':'failed',opts.agentId,opts.runToken,sub.id]});
        }catch(error){
        // Never log exception messages, endpoint URLs, response bodies or signing keys.
        const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'operation-failed';
        ctx.fns.procs.log?.warn?.({event:'web-push.delivery.failed',msg:'Push delivery failed',agentId:opts.agentId,stage,reason});
        await ctx.fns.procs.db.run({sql:"UPDATE web_push_error_deliveries SET status='failed' WHERE agent_id=? AND run_token=? AND subscription_id=?",params:[opts.agentId,opts.runToken,sub.id]}).catch(()=>undefined);}}));
}
