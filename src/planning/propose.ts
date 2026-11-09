/**
 * Present an exact implementation plan for explicit human review
 *
 * Call from the planning agent once research is complete. Persists the immutable plan in a native review card; returns immediately. End the turn afterwards, never poll. Repeating the same pending plan is idempotent.
 * @param opts.plan Complete exact plan text to show and later execute upon explicit approval; 1–50000 characters.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Complete exact plan text to show and later execute upon explicit approval; 1–50000 characters. */
        plan: string;
    },
): Promise<types.planning.State> {
    const agent=await ctx.fns.agent.current({});
    const plan=opts.plan.trim(); if(!plan||plan.length>50000) throw new Error('Plan must contain 1–50000 characters');
    await ctx.fns.procs.db.transaction({fn:async()=>{
    const row=(await ctx.fns.procs.db.select({sql:'SELECT id,archived_at FROM agents WHERE id=? FOR UPDATE',params:[agent.id]}))[0];
    if(!row||row.archived_at!=null) throw new Error('Active session required');
    const state=await ctx.fns.planning.read({agentId:agent.id});
    if(state.mode!=='plan') throw new Error('Enter /plan before proposing a plan');
    if(state.proposal?.status==='pending' && state.proposal.plan===plan) return;
    const now=Date.now(); const id=Bun.randomUUIDv7(); const inputId='in'+Bun.randomUUIDv7().replaceAll('-','').slice(-16);
    if(state.proposal?.status==='pending') await ctx.fns.procs.db.run({sql:"UPDATE inputs SET state='cancelled',error='Replaced by a revised plan',updated_at=? WHERE id=? AND state='open'",params:[now,state.proposal.inputId]});
    const proposal={id,inputId,plan,status:'pending',createdAt:now};
    await ctx.fns.procs.db.run({sql:'UPDATE agent_planning SET proposal=?::jsonb,revision=revision+1,updated_at=? WHERE agent_id=?',params:[JSON.stringify(proposal),now,agent.id]});
    const spec={proposalId:id,plan,revision:state.revision+1};
    await ctx.fns.procs.db.run({sql:"INSERT INTO inputs(id,agent_id,kind,state,title,message,spec,created_at,updated_at) VALUES (?,?,'planning-review','open','Review implementation plan','Advisory planning mode is not a sandbox.',?::jsonb,?,?)",params:[inputId,agent.id,JSON.stringify(spec),now,now]});
    const event={type:'input',inputId,kind:'planning-review',title:'Review implementation plan',ts:now,html:''};
    await ctx.fns.session.appendEvent({id:agent.id,event,ts:now});
    }});
    await ctx.fns.planning.publish({agentId:agent.id,proposal:true});
    return ctx.fns.planning.read({agentId:agent.id});
}
