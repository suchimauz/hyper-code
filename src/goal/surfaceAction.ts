/**
 * Validate and dispatch an authorized persistent goal HTTP action
 *
 * Shared desktop and native JSON boundary with exact CAS and cookie CSRF. Create is paused, edit and pause use externalApply, resume uses idempotent externalResume, clear requires idle owner barrier. Observed and legacy goals are never changed.
 * @param opts.req Incoming authenticated JSON request.
 * @param opts.agentId Exact selected target.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming authenticated JSON request. */
        req: Request;
        /** Exact selected target. */
        agentId: string;
    },
): Promise<Response> {
    const reply=(data:object,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
    if(!await ctx.fns.goal.enabled({}))return reply({version:1,enabled:false,error:'goal_disabled',message:'Goal feature disabled'},409);
    try {
    await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId:opts.agentId});
    const invalid=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
    if(!opts.req.headers.get('content-type')?.includes('application/json'))invalid('JSON body required');
    let body:unknown;try{body=await opts.req.json();}catch{invalid('Invalid JSON');}
    if(!body||typeof body!=='object'||Array.isArray(body))invalid('JSON object required');
    const b=body as Record<string,unknown>;
    if(!['create','edit','pause','resume','clear'].includes(b.action as string))invalid('Unknown action');
    const allowed=['action','expectedGoalId','expectedRevision','expectedRunToken','csrfToken',...(['create','edit','resume'].includes(b.action as string)?['objective','tokenBudget']:[]),...(b.action==='resume'?['expectedStoppedAt','resumeRequestId']:[])];
    if(Object.keys(b).some(k=>!allowed.includes(k)))invalid('Unknown action field');
    const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if(!(b.expectedRunToken===null||typeof b.expectedRunToken==='string'&&b.expectedRunToken.length>0))invalid('Explicit expectedRunToken required');
    if(b.action==='create'){if(b.expectedGoalId!==null||b.expectedRevision!==null||typeof b.objective!=='string')invalid('Create requires absent goal CAS and objective');}
    else if(!uuid(b.expectedGoalId)||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<1)invalid('Existing goal identity and revision required');
    if('objective'in b&&(typeof b.objective!=='string'||!b.objective.trim()))invalid('Nonblank objective required');
    if('tokenBudget'in b&&b.tokenBudget!==null&&(!Number.isSafeInteger(b.tokenBudget)||Number(b.tokenBudget)<=0))invalid('Budget must be a positive safe integer or null');
    if(b.action==='resume'&&(b.expectedRunToken!==null||!uuid(b.resumeRequestId)||!(b.expectedStoppedAt===null||Number.isSafeInteger(b.expectedStoppedAt))))invalid('Explicit idle resume binding required');
    if(b.action==='clear'&&b.expectedRunToken!==null)invalid('Clear requires idle owner');
    if(typeof b.csrfToken!=='string')invalid('CSRF token required');
    await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId:opts.agentId,csrfToken:b.csrfToken as string});
    const base={agentId:opts.agentId,expectedGoalId:b.expectedGoalId as string|null,expectedRevision:b.expectedRevision as number|null,expectedRunToken:b.expectedRunToken as string|null};
    const patch:{objective?:string;tokenBudget?:number|null}={};
    if('objective'in b)patch.objective=b.objective as string;
    if('tokenBudget'in b)patch.tokenBudget=b.tokenBudget as number|null;
    let result;
    if(b.action==='resume')result=await ctx.fns.goal.externalResume({...base,expectedGoalId:b.expectedGoalId as string,expectedRevision:b.expectedRevision as number,expectedRunToken:null,expectedStoppedAt:b.expectedStoppedAt as number|null,resumeRequestId:b.resumeRequestId as string,patch});
    else if(b.action==='clear')result=await ctx.fns.goal.externalClear({...base,expectedGoalId:b.expectedGoalId as string,expectedRevision:b.expectedRevision as number,expectedRunToken:null});
    else result=await ctx.fns.goal.externalApply({...base,...patch,...(b.action==='create'||b.action==='pause'?{status:'paused' as const}:{})});
    return reply({version:1,enabled:true,agentId:opts.agentId,...result});
    }catch(error){const e=error as Error&{status?:number};const conflict=/conflict|busy|disabled|unavailable/i.test(e.message);return reply({error:conflict?'goal_conflict':'goal_action_failed',message:e.status||conflict?e.message:'Goal action unavailable'},e.status??(conflict?409:503));}
}
