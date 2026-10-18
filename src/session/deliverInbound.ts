/**
 * Queue agent messages during compaction and atomically drain durable inbound receipts
 *
 * Use for cross-agent delivery and recovery. Recipient row locks serialize with compaction. Stable immutable keys deduplicate retries; stopped recipients retain content without automatic scheduling.
 * @param opts.id Recipient identifier.
 * @param opts.delivery Immutable keyed delivery; omit to drain pending receipts.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Recipient identifier. */
        id: string;
        /** Immutable keyed delivery; omit to drain pending receipts. */
        delivery?: { key: string; text: string; author: string; messageType: string; event: Record<string, unknown>; wake: boolean };
    },
): Promise<{ queued: boolean; messageIdx: number | null; duplicate: boolean; drained: number }> {
    const d=opts.delivery, payload=d?JSON.stringify(d):null;
    if(d&&(!d.key.trim()||!d.text.trim()))throw new Error('key and text required');
    let result!: {queued:boolean;messageIdx:number|null;duplicate:boolean;drained:number};
    for (let attempt=0; ; attempt++) {
    try {
    result=await ctx.fns.procs.db.transaction({fn:async()=>{
     const target=(await ctx.fns.procs.db.select({sql:'SELECT sleep_context FROM agents WHERE id=? AND archived_at IS NULL FOR UPDATE',params:[opts.id]}))[0];
     if(!target)throw new Error('recipient unavailable');
     let duplicate=false,drained=0;
     if(d){const prior=(await ctx.fns.procs.db.select({sql:'SELECT payload FROM session_inbound_deliveries WHERE agent_id=? AND delivery_key=?',params:[opts.id,d.key]}))[0];
     if(prior&&prior.payload!==payload)throw new Error('delivery key payload mismatch');duplicate=!!prior;
     if(!prior)await ctx.fns.procs.db.run({sql:'INSERT INTO session_inbound_deliveries(agent_id,delivery_key,payload,created_at) VALUES(?,?,?,?)',params:[opts.id,d.key,payload,Date.now()]});}
     const sleep=typeof target.sleep_context==='string'?JSON.parse(target.sleep_context):target.sleep_context;
     if(sleep?.draftRevision==null){
     const rows=await ctx.fns.procs.db.select({sql:'SELECT seq,payload FROM session_inbound_deliveries WHERE agent_id=? AND delivered_at IS NULL ORDER BY seq',params:[opts.id]});
     for(const row of rows){const item=JSON.parse(String(row.payload)) as NonNullable<typeof d>,ts=Date.now();
     const text=await ctx.fns.session.scrubUnicode({text:item.text});
     const m=await ctx.fns.procs.db.run({sql:"INSERT INTO messages(agent_id,idx,role,content,message_type,ts,excluded_from_llm,excluded_from_cursor,author) SELECT ?,COALESCE(MAX(idx),-1)+1,'user',?,?,?,0,0,? FROM messages WHERE agent_id=? RETURNING idx",params:[opts.id,text,item.messageType,ts,item.author,opts.id]});
     const idx=Number(m.rows[0].idx),event:Record<string,unknown>={...item.event,messageIdx:idx,ts,actor:item.author};
     const e=await ctx.fns.procs.db.run({sql:'INSERT INTO events(agent_id,idx,type,payload,ts,actor) SELECT ?,COALESCE(MAX(idx),-1)+1,?,?,?,? FROM events WHERE agent_id=? RETURNING idx',params:[opts.id,String(event.type??'user'),JSON.stringify(event),ts,item.author,opts.id]});
     await ctx.fns.procs.db.run({sql:'UPDATE session_inbound_deliveries SET delivered_at=?,message_idx=?,event_idx=? WHERE seq=?',params:[ts,idx,Number(e.rows[0].idx),row.seq]});
     await ctx.fns.procs.db.run({sql:"UPDATE agents SET updated_at=?,next_run_at=CASE WHEN ? AND COALESCE(last_error,'') NOT LIKE 'stopped by user%' AND COALESCE(last_error,'') <> 'context limit guard stopped work' AND COALESCE(NULLIF(scratchpad,'')::jsonb #>> '{plan,pausedAt}','') IN ('','0') THEN COALESCE(next_run_at,?) ELSE next_run_at END WHERE id=?",params:[ts,item.wake,ts,opts.id]});drained++;}}
     const receipt=d?(await ctx.fns.procs.db.select({sql:'SELECT message_idx,delivered_at FROM session_inbound_deliveries WHERE agent_id=? AND delivery_key=?',params:[opts.id,d.key]}))[0]:null;
     return {queued:!!receipt&&receipt.delivered_at==null,messageIdx:receipt?.message_idx==null?null:Number(receipt.message_idx),duplicate,drained};
    }}) as {queued:boolean;messageIdx:number|null;duplicate:boolean;drained:number};
    break;
    } catch (error) {
      const e=error as {code?:string;message?:string};
      if(attempt>=9 || !(e.code==='23505' || /messages_pkey|events_pkey/.test(e.message??''))) throw error;
      await Bun.sleep(3+Math.random()*20*(attempt+1));
    }
    }
    if(result.drained){try{const live=ctx.state.agent?.[opts.id];if(live)await ctx.fns.session.syncAgentState({agent:live});await ctx.fns.agent.wakeWaiters({agentId:opts.id});ctx.fns.procs.events.refresh({topic:'agent:'+opts.id,reason:'inbound-delivery'});ctx.fns.agent.wakeWorker({});}catch(error){await ctx.fns.procs.log.warn({event:'inbound.projection.failed',msg:String(error),agentId:opts.id});}}
    return result;
}
