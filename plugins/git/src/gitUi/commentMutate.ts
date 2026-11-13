/**
 * Mutate an owned Git comment under an active-agent row lock; serialize create and reopen limits and emit only after commit.
 *
 * Mutate an owned Git comment under an active-agent row lock; serialize create and reopen limits and emit only after commit.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 * @param opts.operation Fixed mutation to execute atomically.
 * @param opts.id UUID of an existing comment in the pinned repository.
 * @param opts.anchor Validated diff anchor required when creating.
 * @param opts.body Markdown body required for create or update; 1–8192 UTF-8 bytes.
 * @param opts.note Optional resolution note, at most 2048 UTF-8 bytes.
 * @param opts.resolvedBy Trusted resolver identity; defaults to user.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp. */
        agentId: string;
        /** Identifier of an open Git Canvas item owned by this agent. */
        itemId: number;
        /** Fixed mutation to execute atomically. */
        operation: 'create'|'update'|'delete'|'resolve'|'reopen';
        /** UUID of an existing comment in the pinned repository. */
        id?: string;
        /** Validated diff anchor required when creating. */
        anchor?: types.gitUi.CommentAnchor;
        /** Markdown body required for create or update; 1–8192 UTF-8 bytes. */
        body?: string;
        /** Optional resolution note, at most 2048 UTF-8 bytes. */
        note?: string;
        /** Trusted resolver identity; defaults to user. */
        resolvedBy?: 'user'|'agent';
    },
): Promise<{comment:types.gitUi.ReviewComment|null}> {
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
     const owners=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id = ? AND archived_at IS NULL FOR UPDATE',params:[opts.agentId]});
     if(!owners.length)throw Object.assign(new Error('Agent is unavailable'),{status:403});
     const target=await ctx.fns.gitUi.ownedItem({agentId:opts.agentId,itemId:opts.itemId});
     const {host,dir}=target;const where=[opts.agentId,host,dir];
     let row:types.gitUi.ReviewComment|undefined;
     if(opts.operation!=='create'){
      if(typeof opts.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.id))throw new Error('Invalid comment id');
      row=(await ctx.fns.procs.db.select({sql:'SELECT c.* FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=? AND c.id=?',params:[...where,opts.id]}))[0];
      if(!row)throw Object.assign(new Error('Comment not found'),{status:403});
     }
     if(opts.operation==='create'||opts.operation==='update'){
      if(typeof opts.body!=='string'||Buffer.byteLength(opts.body)<1||Buffer.byteLength(opts.body)>8192)throw new Error('Body must contain 1–8192 UTF-8 bytes');
     }
     if(opts.note!==undefined&&(typeof opts.note!=='string'||Buffer.byteLength(opts.note)>2048))throw new Error('Resolution note exceeds 2048 UTF-8 bytes');
     if(opts.resolvedBy!==undefined&&!['user','agent'].includes(opts.resolvedBy))throw new Error('Invalid resolver');
     if(opts.operation==='create'||(opts.operation==='reopen'&&row?.status==='resolved')){
      const count=await ctx.fns.procs.db.select({sql:"SELECT count(*) AS n FROM git_review_comments WHERE agent_id=? AND host=? AND dir=? AND status='open'",params:where});
      if(Number(count[0].n)>=500)throw Object.assign(new Error('Maximum of 500 open comments reached'),{status:409});
     }
     const now=Date.now();let id=opts.id;
     if(opts.operation==='create'){
      const a=opts.anchor;
      if(!a||!['old','new'].includes(a.side)||!Number.isSafeInteger(a.line_start)||!Number.isSafeInteger(a.line_end)||a.line_start<1||a.line_end<a.line_start||typeof a.line_text!=='string'||Buffer.byteLength(a.line_text)>2048)throw new Error('Invalid comment anchor');
      if(a.scope==='commit'){if(!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(a.commit_hash)||a.worktree_group!==null)throw new Error('Invalid commit anchor');}
      else if(a.scope!=='worktree'||a.commit_hash!==null||!['staged','unstaged','untracked'].includes(a.worktree_group))throw new Error('Invalid worktree anchor');
      // Commit/index paths (including rename sources) are Git object names, not worktree reads.
      // diff checks the current path on disk only for unstaged/untracked content.
      await ctx.fns.gitUi.commentPath({path:a.path});
      if(a.old_path!==null)await ctx.fns.gitUi.commentPath({path:a.old_path});
      const diff=await ctx.fns.gitUi.diff({host,dir,path:a.path,group:a.scope==='commit'?'commit':a.worktree_group,hash:a.commit_hash??undefined});
      const file=a.scope==='commit'
       ? (await ctx.fns.gitUi.commit({host,dir,hash:a.commit_hash})).files.find(f=>f.path===a.path)
       : (await ctx.fns.gitUi.snapshot({host,dir})).files.find(f=>f.path===a.path&&f.group===a.worktree_group);
      if(!file||(file.oldPath??null)!==a.old_path)throw new Error('Anchor old_path must match the actual rename source');
      const text=await ctx.fns.gitUi.commentLines({patch:diff.patch,side:a.side,start:a.line_start,end:a.line_end});
      if(text===null||text!==a.line_text)throw new Error('Anchor must match the current diff range');
      id=Bun.randomUUIDv7();
      await ctx.fns.procs.db.insert({into:'git_review_comments',values:{id,agent_id:opts.agentId,host,dir,scope:a.scope,commit_hash:a.commit_hash,worktree_group:a.worktree_group,path:a.path,old_path:a.old_path,side:a.side,line_start:a.line_start,line_end:a.line_end,line_text:a.line_text,body:opts.body,status:'open',created_at:now,updated_at:now}});
     }else if(row){
      await ctx.fns.gitUi.commentPath({path:row.path});
      if(opts.operation==='delete')await ctx.fns.procs.db.run({sql:'DELETE FROM git_review_comments WHERE id=?',params:[id]});
      else if(opts.operation==='update')await ctx.fns.procs.db.run({sql:'UPDATE git_review_comments SET body=?,updated_at=? WHERE id=?',params:[opts.body,now,id]});
      else if(opts.operation==='resolve'&&row.status==='open')await ctx.fns.procs.db.run({sql:"UPDATE git_review_comments SET status='resolved',resolution_note=?,resolved_by=?,resolved_at=?,updated_at=? WHERE id=?",params:[opts.note??null,opts.resolvedBy??'user',now,now,id]});
      else if(opts.operation==='reopen'&&row.status==='resolved')await ctx.fns.procs.db.run({sql:"UPDATE git_review_comments SET status='open',sent_at=NULL,resolved_at=NULL,resolved_by=NULL,resolution_note=NULL,updated_at=? WHERE id=?",params:[now,id]});
     }
     const saved=opts.operation==='delete'?null:(await ctx.fns.procs.db.select({sql:'SELECT c.* FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.id=?',params:[id]}))[0];
     return {host,dir,comment:saved?await ctx.fns.gitUi.commentView({row:saved,outdated:await ctx.fns.gitUi.commentOutdated({row:saved})}):null};
    }}) as {host:string;dir:string;comment:types.gitUi.ReviewComment|null};
    await ctx.fns.gitUi.commentsChanged({host:result.host,dir:result.dir});
    return {comment:result.comment};
}
