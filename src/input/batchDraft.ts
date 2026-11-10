/**
 * Encrypt and save one batch draft with revision locking and sequential navigation validation.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.id Parent batch identifier.
 * @param opts.revision Expected optimistic revision.
 * @param opts.key Member key being saved.
 * @param opts.values Private answer values; secrets require dedicated transport.
 * @param opts.currentStep Requested visible step index.
 * @param opts.secret Server-only dedicated secret transport marker.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parent batch identifier. */
        id: string;
        /** Expected optimistic revision. */
        revision: number;
        /** Member key being saved. */
        key: string;
        /** Private answer values; secrets require dedicated transport. */
        values?: types.input.FormValues;
        /** Requested visible step index. */
        currentStep?: number;
        /** Server-only dedicated secret transport marker. */
        secret?: boolean;
    },
): Promise<Record<string, unknown>> {
    const initial=await ctx.fns.input.get({id:opts.id});if(!initial||initial.kind!=='batch')throw new Error('Batch not found');
    await ctx.fns.procs.db.transaction({fn:async()=>{
     await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[initial.agentId]});
     const input=await ctx.fns.input.get({id:opts.id});const [row]=await ctx.fns.procs.db.select({sql:"SELECT b.*,i.spec->>'_expiresAt' AS expires_at FROM input_batch_state b JOIN inputs i ON i.id=b.input_id WHERE b.input_id=? FOR UPDATE OF b",params:[opts.id]});
     if(!input||input.state!=='open'||!row||Number(row.revision)!==opts.revision)throw new Error('Batch conflict');
     if(Number(row.expires_at)&&Number(row.expires_at)<=Date.now())throw new Error('Batch expired');
     const item=input.spec.items.find((i:any)=>i.key===opts.key);if(!item)throw new Error('Invalid batch member');
     if(opts.values!==undefined&&item.kind==='secret'&&!opts.secret)throw new Error('Use isolated secret field');
     if(opts.secret&&item.kind!=='secret')throw new Error('Invalid secret member');
     const drafts:Record<string,types.input.FormValues>=row.draft_enc?JSON.parse(await ctx.fns.secrets.decryptLocal({namespace:'input-batch-draft',name:opts.id+':'+row.revision,envelope:row.draft_enc})):{};
     if(opts.values!==undefined){const valid=await ctx.fns.input.batchValidate({item,values:opts.values});drafts[opts.key]=valid.values;}
     const next=opts.currentStep??Number(row.current_step);if(!Number.isInteger(next)||next<0||next>=input.spec.items.length)throw new Error('Invalid batch step');
     for(let i=0;i<next;i++)if(!drafts[input.spec.items[i].key])throw new Error('Complete preceding steps first');
     const envelope=await ctx.fns.secrets.encryptLocal({namespace:'input-batch-draft',name:opts.id+':'+(Number(row.revision)+1),value:JSON.stringify(drafts)});
     await ctx.fns.procs.db.run({sql:'UPDATE input_batch_state SET revision=revision+1,current_step=?,draft_enc=? WHERE input_id=?',params:[next,envelope,opts.id]});
     await ctx.fns.procs.db.run({sql:'UPDATE inputs SET updated_at=? WHERE id=?',params:[Date.now(),opts.id]});
    }});
    ctx.fns.procs.events.refresh({topic:'agent:'+initial.agentId,reason:'input'});
    return await ctx.fns.input.batchSnapshot({id:opts.id,drafts:true});
}
