/** Read an owner-authorized trigger audit as JSON, including at most 100 newest executions and stored-result references. Never executes or modifies triggers.
 * @param opts.req Incoming GET request.
 * @param opts.params Exact agent id and triggerId route parameters.
 */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming HTTP request. */req:Request;/** Exact agent and trigger identifiers. */params:Record<string,string>}):Promise<Response>{
 const headers={'Cache-Control':'no-store',Vary:'Cookie'};
 try {
 const agentId=opts.params.id!; const triggerId=opts.params.triggerId!;
 await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId});
 const trigger=(await ctx.fns.procs.db.select({sql:`SELECT id,kind,prompt,config,timezone,mode,status,next_at AS "nextAt",timeout_at AS "timeoutAt",attempts,last_error AS "lastError",created_at AS "createdAt",finished_at AS "finishedAt" FROM agent_triggers WHERE id=? AND agent_id=?`,params:[triggerId,agentId]}))[0];
 if(!trigger)return Response.json({message:'Trigger not found'},{status:404,headers});
 const runs=await ctx.fns.procs.db.select({sql:`SELECT id,scheduled_at AS "scheduledAt",outcome,result,result_ref AS "resultRef",error,created_at AS "createdAt" FROM agent_trigger_runs WHERE trigger_id=? ORDER BY id DESC LIMIT 100`,params:[triggerId]});
 return Response.json({trigger,runs,limit:100},{headers});
 }catch(error){const e=error as Error&{status?:number};return Response.json({message:e.status?e.message:'Trigger audit unavailable'},{status:e.status??500,headers});}
}
