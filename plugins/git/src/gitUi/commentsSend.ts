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
     // Reference-only delivery: identities and retrieval instructions, never bodies, quoted lines or diffs.
     // commentMutate caps open comments at 500 per agent/repository under the same agent row lock, so one reference
     // normally carries the whole set. Defensively split any larger set into ordered 500-ID references in this transaction.
     const all=rows.map(r=>String(r.id).toLowerCase());
     const nl=String.fromCharCode(10);
     const ts=Date.now();
     for(let start=0;start<all.length;start+=500){
      const ids=all.slice(start,start+500);
      const text='Git review comments for '+host+':'+dir+' ('+ids.length+')'+nl+'Comment content is not included. Call gitReviewComments({ ids, status: \'all\' }) with exactly these ids and follow nextPage with unchanged filters until it is null; returned details are current, not a snapshot. Address each comment, then call gitResolveComment({ id, note }).'+nl+nl+'ids: '+JSON.stringify(ids);
      const gitReview={version:1,host,dir,count:ids.length,ids};
      if(!await ctx.fns.session.decodeReviewReference({value:gitReview}))throw new Error('Invalid review reference');
      await ctx.fns.session.appendUserMessage({id:opts.agentId,text,ts,messageType:'git_review_comments',eventExtra:{gitReview}});
     }
     await ctx.fns.procs.db.run({sql:'UPDATE agents SET next_run_at=COALESCE(next_run_at,?),stopped_at=NULL,updated_at=? WHERE id=?',params:[ts,ts,opts.agentId]});
     for(const row of rows)await ctx.fns.procs.db.run({sql:'UPDATE git_review_comments SET sent_at=?,updated_at=? WHERE id=?',params:[ts,ts,row.id]});
     return {sent:rows.length,host,dir};
    }}) as {sent:number;host:string;dir:string};
    if(result.sent){await ctx.fns.gitUi.commentsChanged({host:result.host,dir:result.dir});ctx.fns.procs.events.refresh({topic:'agent:'+opts.agentId,reason:'git-review-comments'});ctx.fns.agent.wakeWorker({});}
    return {sent:result.sent};
}
