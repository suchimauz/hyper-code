/**
 * Project a consistent batch receipt and safe editable drafts without exposing secret values.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.id Stored parent batch identifier.
 * @param opts.drafts Include safe nonsecret draft projections for editing.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stored parent batch identifier. */
        id: string;
        /** Include safe nonsecret draft projections for editing. */
        drafts?: boolean;
    },
): Promise<Record<string, unknown>> {
    const [stored]=await ctx.fns.procs.db.select({sql:"SELECT b.*,i.id,i.agent_id,i.state,i.title,i.message,i.spec,i.created_at,i.updated_at FROM input_batch_state b JOIN inputs i ON i.id=b.input_id WHERE i.id=? AND i.kind='batch'",params:[opts.id]});
    if(!stored)throw new Error('Batch not found');
    const input={id:stored.id,agentId:stored.agent_id,state:stored.state,title:stored.title,message:stored.message,spec:stored.spec,createdAt:Number(stored.created_at),updatedAt:Number(stored.updated_at)};
    const open=input.state==='open';let drafts:Record<string,types.input.FormValues>={};
    if(opts.drafts&&open&&stored.draft_enc)drafts=JSON.parse(await ctx.fns.secrets.decryptLocal({namespace:'input-batch-draft',name:input.id+':'+stored.revision,envelope:stored.draft_enc}));
    const filled:Record<string,boolean>={};
    if(open&&stored.draft_enc){const d=JSON.parse(await ctx.fns.secrets.decryptLocal({namespace:'input-batch-draft',name:input.id+':'+stored.revision,envelope:stored.draft_enc}));for(const k of Object.keys(d))filled[k]=true;}
    const items=input.spec.items.map((item:any)=>{const codec=(ctx.state as any).input?.kinds?.[item.kind]?.batch;let spec={};let draft;
    try{if(codec){spec=codec.projectSpec({spec:item.spec});if(opts.drafts&&open&&item.kind!=='secret'&&drafts[item.key])draft=codec.projectDraft({spec:item.spec,values:drafts[item.key]});}}catch{spec={};}
    return {key:item.key,kind:item.kind,title:item.title,message:item.message,spec,filled:!!filled[item.key],contractVersion:1,...(draft?{draft}:{})};});
    return {id:input.id,agentId:input.agentId,kind:'batch',title:input.title,message:input.message,state:input.state,revision:Number(stored.revision),currentStep:Number(stored.current_step),items,...(stored.history?{history:stored.history}:{}),...(stored.error?{error:stored.error}:{}),createdAt:input.createdAt,updatedAt:input.updatedAt};
}
