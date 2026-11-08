/**
 * Snapshot or atomically answer all pending ordinary choice inputs for one agent
 *
 * Trusted backend primitive for authenticated choice bridges. A revision binds exact pending membership, specs and states. Supply all answers or none; rejects changed membership, validation failures and duplicate retries before delivery. Locks the agent then all pending inputs; input.request must use the same agent lock. Preserves manual Stop and remaining durable waits. Publishes only after commit.
 * @param opts.agentId Agent owning every choice.
 * @param opts.revision Exact server snapshot revision required to submit.
 * @param opts.answers Complete answers using explicit other selection; omit to read snapshot.
 * @param opts.actor Authenticated human author ID required for submission.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning every choice. */
        agentId: string;
        /** Exact server snapshot revision required to submit. */
        revision?: string;
        /** Complete answers using explicit other selection; omit to read snapshot. */
        answers?: Array<{id:string;value?:string;values?:string[];otherSelected:boolean;other?:string}>;
        /** Authenticated human author ID required for submission. */
        actor?: string;
    },
): Promise<{revision:string;inputIds:string[];state?:string}> {
    const snapshot = async (lock: boolean) => {
     const rows = await ctx.fns.procs.db.select({sql:"SELECT id, kind, state, title, spec, updated_at FROM inputs WHERE agent_id = ? AND state IN ('open','processing') ORDER BY id" + (lock ? ' FOR UPDATE' : ''),params:[opts.agentId]});
     const choices=rows.filter((r:any)=>r.kind==='choice');
     const revision=new Bun.CryptoHasher('sha256').update(JSON.stringify([opts.agentId,choices])).digest('hex');
     return {rows,choices,revision,inputIds:choices.map((r:any)=>String(r.id))};
    };
    if(opts.answers===undefined){const s=await snapshot(false);return {revision:s.revision,inputIds:s.inputIds};}
    if(!opts.actor || opts.actor.startsWith('agent:') || !opts.revision || !Array.isArray(opts.answers) || !opts.answers.length || opts.answers.length>100)throw new Error('Invalid batch');
    const out=await ctx.fns.procs.db.transaction({fn:async()=>{
     const agents=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL FOR UPDATE',params:[opts.agentId]});
     if(!agents.length)throw new Error('Stale batch');
     const s=await snapshot(true);
     if(s.revision!==opts.revision || s.choices.some((r:any)=>r.state!=='open') || s.inputIds.length!==opts.answers!.length || new Set(opts.answers!.map(a=>a.id)).size!==s.inputIds.length || opts.answers!.some(a=>!s.inputIds.includes(a.id)))throw new Error('Stale batch');
     const outcomes=[];
     for(const row of s.choices){
      const answer=opts.answers!.find(a=>a.id===row.id)!;
      if(Object.keys(answer).some(k=>!['id','value','values','otherSelected','other'].includes(k))||typeof answer.otherSelected!=='boolean')throw new Error('Invalid choice answer');
      const input=await ctx.fns.input.get({id:row.id});
      if(!input || input.kind!=='choice' || input.agentId!==opts.agentId)throw new Error('Stale batch');
      const spec=input.spec;
      if(('value' in answer&&typeof answer.value!=='string')||('values' in answer&&(!Array.isArray(answer.values)||answer.values.some(v=>typeof v!=='string')))||('value' in answer&&'values' in answer)||(!spec.multiple&&'values' in answer)||(spec.multiple&&'value' in answer))throw new Error('Invalid selection');
      const picks=spec.multiple?(answer.values??[]):typeof answer.value==='string'?[answer.value]:[];
      if(picks.length>30||new Set(picks).size!==picks.length||picks.some((v:string)=>!spec.options.some((o:any)=>o.value===v)))throw new Error('Invalid selection');
      if((!answer.otherSelected&&'other' in answer)||(answer.otherSelected&&(!spec.allowOther||typeof answer.other!=='string'||!answer.other.trim()||answer.other.length>2000))||(!spec.multiple&&answer.otherSelected&&picks.length)||(!answer.otherSelected&&!picks.length))throw new Error('Invalid other selection');
      const values:Record<string,string|string[]>={pick:picks};if(answer.otherSelected)values.other=answer.other!.trim();
      const kind=(ctx.state as any).input?.kinds?.choice as types.input.Registered|undefined;
      if(!kind)throw new Error('Choice kind unavailable');
      const outcome=await kind.submit(ctx,{input,values});outcomes.push({input,outcome});
     }
     const now=Date.now();const batchId=crypto.randomUUID();const attr=(v:string)=>v.replace(/[&"<>]/g,ch=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[ch]!));
     for(const {input,outcome} of outcomes){
      await ctx.fns.procs.db.run({sql:"UPDATE inputs SET state='submitted', spec=jsonb_set(spec, '{_choiceBatchId}', to_jsonb(?::text)), result=?::jsonb, error=NULL, answered_by=?, updated_at=? WHERE id=?",params:[batchId,JSON.stringify(outcome.result),opts.actor,now,input.id]});
      const content='<input-result id="'+attr(input.id)+'" kind="choice" state="submitted" title="'+attr(input.title)+'">\n'+outcome.summary+'\n'+JSON.stringify(outcome.result)+'\n</input-result>';
      await ctx.fns.session.appendMessage({id:opts.agentId,message:{role:'user',content,message_type:'input',author:opts.actor},ts:now});
     }
     await ctx.fns.procs.db.run({sql:"UPDATE agents SET next_run_at=GREATEST(COALESCE(next_run_at,0),?), updated_at=? WHERE id=? AND archived_at IS NULL AND stopped_at IS NULL AND NOT EXISTS (SELECT 1 FROM inputs WHERE agent_id=? AND state IN ('open','processing') AND spec->>'_agentWait'='true')",params:[now,now,opts.agentId,opts.agentId]});
     return {revision:s.revision,inputIds:s.inputIds,state:'submitted'};
    }});
    const live=(ctx.state as any).agent?.[opts.agentId];if(live)await ctx.fns.session.syncAgentState({agent:live});
    ctx.fns.procs.events.refresh({topic:'agent:'+opts.agentId,reason:'input'});ctx.fns.agent.wakeWorker({});
    return out as {revision:string;inputIds:string[];state?:string};
}
