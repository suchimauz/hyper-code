/**
 * Atomically accept a slash command without sending toggles to the model
 *
 * Use from authenticated chat submission routes. Bare /plan toggles the locked durable mode; explicit arguments retain their parsed behavior. Deduplicate command text by request key, reject running transitions and schedule only an explicit task in the same transaction as mode change.
 * @param opts.agentId Existing target session.
 * @param opts.text Complete command text.
 * @param opts.requestId Client idempotency key; generate a UUID if absent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing target session. */
        agentId: string;
        /** Complete command text. */
        text: string;
        /** Client idempotency key; generate a UUID if absent. */
        requestId: string;
    },
): Promise<Record<string, unknown>> {
    const command=await ctx.fns.commands.parse({text:opts.text});
    if(!command) throw Object.assign(new Error('Expected a slash command'),{status:400,code:'invalid_command'});
    if(!opts.requestId || opts.requestId.length>200) throw Object.assign(new Error('Invalid requestId'),{status:400});
    const text=opts.text.trim(); if(text.length>200000) throw Object.assign(new Error('Command is too long'),{status:413});
    if(command.name==='compact') return ctx.fns.commands.compact({agentId:opts.agentId,text,requestId:opts.requestId});
    const operationId=Bun.randomUUIDv7();
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]});
    const prior=(await ctx.fns.procs.db.select({sql:'SELECT command_text,result FROM agent_command_requests WHERE agent_id=? AND request_id=?',params:[opts.agentId,opts.requestId]}))[0];
    if(prior){if(prior.command_text!==text) throw Object.assign(new Error('Idempotency key reused for a different command'),{status:409,code:'idempotency_conflict'}); return {...(typeof prior.result==='string'?JSON.parse(prior.result):prior.result),duplicate:true};}
    const priorMessage=(await ctx.fns.procs.db.select({sql:'SELECT idx FROM messages WHERE agent_id=? AND client_request_id=? LIMIT 1',params:[opts.agentId,opts.requestId]}))[0];
    if(priorMessage) throw Object.assign(new Error('Idempotency key already belongs to a chat message'),{status:409,code:'idempotency_conflict'});
    await ctx.fns.planning.assertIdle({agentId:opts.agentId});
    await ctx.fns.commands.recordEvent({agentId:opts.agentId,type:'command_invocation',commandName:command.name,commandText:text,requestId:opts.requestId,operationId,status:'running',text});
    const now=Date.now(); const state=await ctx.fns.planning.read({agentId:opts.agentId});
    const mode=text==='/plan'?(state.mode==='plan'?'execute':'plan'):command.mode;
    if(state.proposal?.status==='pending') await ctx.fns.procs.db.run({sql:"UPDATE inputs SET state='cancelled',error='Planning command superseded this proposal',updated_at=? WHERE id=? AND state='open'",params:[now,state.proposal.inputId]});
    await ctx.fns.procs.db.run({sql:'INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,?,1,NULL,?) ON CONFLICT(agent_id) DO UPDATE SET mode=excluded.mode,revision=agent_planning.revision+1,proposal=NULL,updated_at=excluded.updated_at',params:[opts.agentId,mode,now]});
    let messageIdx:number|undefined;
    if(command.task){
    const message=await ctx.fns.session.appendMessage({id:opts.agentId,message:{role:'user',content:command.task,message_type:'planning_task'}}); messageIdx=message.idx;
    const event={type:'user',text:command.task,messageIdx,ts:now,command:{name:'plan',text,argsText:command.task,requestId:opts.requestId,operationId},html:''}; event.html=await ctx.fns.agent.renderEventHtml({event,agentId:opts.agentId});
    await ctx.fns.session.appendEvent({id:opts.agentId,event,ts:now});
    await ctx.fns.procs.db.run({sql:'UPDATE agents SET stopped_at=NULL,last_error=NULL,next_run_at=?,updated_at=? WHERE id=?',params:[now,now,opts.agentId]});
    }
    const planning=await ctx.fns.planning.read({agentId:opts.agentId});
    const accepted={ok:true,command:command.name,requestId:opts.requestId,operationId,status:'completed',createdAt:now,finishedAt:now,scheduled:!!command.task,planning,...(messageIdx===undefined?{}:{messageIdx,sendAt:now}),attachments:[]};
    await ctx.fns.procs.db.run({sql:'INSERT INTO agent_command_requests(agent_id,request_id,command_text,result) VALUES (?,?,?,?::jsonb)',params:[opts.agentId,opts.requestId,text,JSON.stringify(accepted)]});
    await ctx.fns.commands.recordEvent({agentId:opts.agentId,type:'command_result',commandName:command.name,commandText:text,requestId:opts.requestId,operationId,status:'completed',text:mode==='execute'?'Planning mode disabled':command.task?'Planning mode enabled; task accepted':'Planning mode enabled (advisory, not a sandbox)'});
    return accepted;
    }}) as Record<string,unknown>;
    if(!result.duplicate) await ctx.fns.planning.publish({agentId:opts.agentId,proposal:true,wake:result.scheduled===true,operationId,requestId:opts.requestId});
    return result;
}
