/**
 * Atomically deliver unsent Git review comments to their owning agent.
 *
 * Use from an authorized open Git tab. ui.sendToAgent mutates memory and queues a microtask and cannot join a transaction. session.appendUserMessage and durable next_run_at scheduling instead share the framework AsyncLocalStorage transaction with sent_at. Its early refresh carries no content; publish again and wake after commit. Agent and comment row locks serialize concurrent delivery. Any write failure rolls back transcript, event, schedule and receipts.
 * @param opts.agentId Trusted authenticated owner identifier.
 * @param opts.itemId Open owned Git Canvas item identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted authenticated owner identifier. */
        agentId: string;
        /** Open owned Git Canvas item identifier. */
        itemId: number;
    },
): Promise<{sent:number}> {
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
     const active=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL FOR UPDATE',params:[opts.agentId]});
     if(!active.length)throw Object.assign(new Error('Agent is unavailable'),{status:403});
     const {host,dir}=await ctx.fns.gitUi.ownedItem(opts);
     const rows=await ctx.fns.procs.db.select({sql:"SELECT c.* FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=? AND c.status='open' AND c.sent_at IS NULL ORDER BY c.created_at,c.id FOR UPDATE OF c",params:[opts.agentId,host,dir]});
     if(!rows.length)return {sent:0,host,dir};
     const nl=String.fromCharCode(10);
     const text='Git review comments for '+host+':'+dir+' ('+rows.length+')'+nl+'Use gitResolveComment({ id, note }) after addressing each one.'+nl+nl+rows.map((r,i)=>(i+1)+'. '+r.path+':'+r.line_start+'-'+r.line_end+' ('+r.side+', '+(r.scope==='commit'?'commit '+String(r.commit_hash).slice(0,8):r.worktree_group)+') — id '+r.id+nl+'   > '+String(r.line_text).replaceAll(nl,nl+'   > ')+nl+'   '+String(r.body).replaceAll(nl,nl+'   ')).join(nl+nl);
     const ts=Date.now();
     await ctx.fns.session.appendUserMessage({id:opts.agentId,text,ts,messageType:'git_review_comments'});
     await ctx.fns.procs.db.run({sql:'UPDATE agents SET next_run_at=COALESCE(next_run_at,?),stopped_at=NULL,updated_at=? WHERE id=?',params:[ts,ts,opts.agentId]});
     for(const row of rows)await ctx.fns.procs.db.run({sql:'UPDATE git_review_comments SET sent_at=?,updated_at=? WHERE id=?',params:[ts,ts,row.id]});
     return {sent:rows.length,host,dir};
    }}) as {sent:number;host:string;dir:string};
    if(result.sent){await ctx.fns.gitUi.commentsChanged({host:result.host,dir:result.dir});ctx.fns.procs.events.refresh({topic:'agent:'+opts.agentId,reason:'git-review-comments'});ctx.fns.agent.wakeWorker({});}
    return {sent:result.sent};
}
