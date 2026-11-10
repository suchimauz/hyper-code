/**
 * Serialize batch submission, cancellation, expiry and interrupted-attempt recovery under a database session lock.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.id Parent batch identifier.
 * @param opts.action Authorized final action or worker recovery.
 * @param opts.revision Browser expected revision.
 * @param opts.requestId Unique browser submission attempt identifier.
 * @param opts.actor Authenticated browser actor.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parent batch identifier. */
        id: string;
        /** Authorized final action or worker recovery. */
        action: "submit" | "cancel" | "recover" | "expire";
        /** Browser expected revision. */
        revision?: number;
        /** Unique browser submission attempt identifier. */
        requestId?: string;
        /** Authenticated browser actor. */
        actor?: string;
    },
): Promise<Record<string, unknown>> {
    const guarded=await ctx.fns.procs.db.withSessionLock({key:'input-batch:'+opts.id,tryOnly:opts.action==='recover',fn:async()=>{
    const initial=await ctx.fns.input.get({id:opts.id});if(!initial||initial.kind!=='batch')throw new Error('Batch not found');
    const lock=async()=>{await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[initial.agentId]});return (await ctx.fns.procs.db.select({sql:"SELECT b.*,i.spec->>'_expiresAt' AS expires_at FROM input_batch_state b JOIN inputs i ON i.id=b.input_id WHERE b.input_id=? FOR UPDATE OF b",params:[opts.id]}))[0];};
    const terminal=(state:string)=>!['open','processing'].includes(state);
    const history=(summary:string)=>({summary,items:initial.spec.items.map((i:any)=>({key:i.key,kind:i.kind,title:i.title,message:i.message,summary}))});
    let accepted=false;
    if(opts.action==='submit'){
     if(typeof opts.requestId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(opts.requestId))throw new Error('Invalid request identifier');
     await ctx.fns.procs.db.transaction({fn:async()=>{const row=await lock();const input=(await ctx.fns.input.get({id:opts.id}))!;
     if(terminal(input.state))return;
     if(input.state==='processing')return;
     if(Number(row.revision)!==opts.revision)throw new Error('Batch conflict');
     await ctx.fns.procs.db.run({sql:"UPDATE inputs SET state='processing',updated_at=? WHERE id=?",params:[Date.now(),opts.id]});
     accepted=true;
     await ctx.fns.procs.db.run({sql:'UPDATE input_batch_state SET attempt_id=?,accepted_at=? WHERE input_id=?',params:[opts.requestId,Date.now(),opts.id]});
     }});
    }
    let failure:Record<string,unknown>|undefined;
    try{await ctx.fns.procs.db.transaction({fn:async()=>{
     const row=await lock();const input=(await ctx.fns.input.get({id:opts.id}))!;if(terminal(input.state))return;
     if(opts.action==='cancel'){
     if(input.state!=='open'||Number(row.revision)!==opts.revision)throw new Error('Batch conflict');
     await ctx.fns.input.batchFinish({id:opts.id,state:'cancelled',result:{reason:'cancelled'},history:history('Cancelled'),actor:opts.actor});return;
     }
     if(opts.action==='expire'){
     if(input.state!=='open'||!Number(row.expires_at)||Number(row.expires_at)>Date.now())return;
     await ctx.fns.input.batchFinish({id:opts.id,state:'expired',result:{reason:'expired'},history:history('Expired'),actor:'system:expiry'});return;
     }
     if(input.state!=='processing'||!row.attempt_id)return;
     if(opts.action==='recover'||!accepted){failure={code:'interrupted',message:'Batch submission was interrupted; no answers were saved'};throw new Error('Interrupted batch');}
     if(Number(row.expires_at)&&Number(row.expires_at)<=Date.now()){failure={code:'expired',message:'Batch deadline passed'};throw new Error('Batch invalid');}
     const drafts=row.draft_enc?JSON.parse(await ctx.fns.secrets.decryptLocal({namespace:'input-batch-draft',name:opts.id+':'+row.revision,envelope:row.draft_enc})):{};
     const answers=[];const histories=[];
     for(const item of input.spec.items){
     failure={code:'invalid_answer',message:'An answer is missing or no longer valid',stepKey:item.key};
     let valid;
     try{valid=await ctx.fns.input.batchValidate({item,values:drafts[item.key]??{}});}catch(e){const safe=(e as {batchError?:Record<string,unknown>}).batchError;if(safe)failure={...safe,stepKey:item.key};throw e;}
     if(item.kind==='secret'){failure={code:'storage_failed',message:'The secret could not be stored; no answers were saved',stepKey:item.key};const {namespace,name}=ctx.fns.secrets.parseRef({ref:String(item.spec.saveAs)});await ctx.fns.secrets.putLocal({namespace,name,value:String(valid.values.value),source:'input-batch'});}
     answers.push({key:item.key,kind:item.kind,result:valid.result});
     const codec=(ctx.state as any).input.kinds[item.kind].batch;
     const h=codec.history?.({spec:item.spec,result:valid.result});
     histories.push({key:item.key,kind:item.kind,title:item.title,message:item.message,summary:typeof h?.summary==='string'?h.summary.slice(0,500):'Answer received',...(Array.isArray(h?.details)?{details:h.details.filter((d:any)=>typeof d?.label==='string'&&typeof d?.value==='string').slice(0,20).map((d:any)=>({label:d.label.slice(0,100),value:d.value.slice(0,2000)}))}:{})});
     }
     failure=undefined;
     await ctx.fns.input.batchFinish({id:opts.id,state:'submitted',result:{answers},history:{summary:'Questions '+answers.length,items:histories},actor:opts.actor});
    }});}catch(error){
     if(opts.action==='cancel'||opts.action==='expire')throw error;
     const safe=failure??{code:'batch_failed',message:'Batch could not be completed; no answers were saved'};
     await ctx.fns.procs.db.transaction({fn:async()=>{await lock();const input=(await ctx.fns.input.get({id:opts.id}))!;if(terminal(input.state))return;
     await ctx.fns.input.batchFinish({id:opts.id,state:'cancelled',result:{reason:'error',error:safe},error:safe,history:history('Cancelled: answers were not saved'),actor:'system:batch'});
     }});
    }
    const live=(ctx.state as any).agent?.[initial.agentId];if(live)await ctx.fns.session.syncAgentState({agent:live});
    ctx.fns.procs.events.refresh({topic:'agent:'+initial.agentId,reason:'input'});ctx.fns.agent.wakeWorker({});
    const receipt=await ctx.fns.input.batchSnapshot({id:opts.id,drafts:true});
    if(terminal(String(receipt.state)))await ctx.fns.webPush.recall({inputId:opts.id}).catch(()=>undefined);
    return receipt;
    }});
    return guarded.acquired ? guarded.value as Record<string,unknown> : {id:opts.id,state:'processing'};
}
