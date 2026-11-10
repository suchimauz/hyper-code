/** Atomic collection container. Members are validated only through pure batch codecs. */
export const hint='atomic ordered collection of 1–30 compatible questions — spec `{items:[{key,kind,title,message?,spec?,expiresAt?}]}`; result `{answers:[{key,kind,result}]}` only after final send. No external actions, protected approvals or nested batches.';
export default {
 icon:'list-checks', completionAuthority:{},
 async prepare(ctx:Context,opts:{spec:Record<string,unknown>}){return await ctx.fns.input.batchNormalize({spec:opts.spec});},
 deadline(_ctx:Context,opts:{spec:Record<string,any>}){const deadlines=opts.spec.items.map((i:any)=>i.expiresAt).filter((v:any)=>typeof v==='number');return deadlines.length?Math.min(...deadlines):undefined;},
 buttons(){return '';},cancel:false,
 projectCard(){return {};},
 async history(ctx:Context,opts:{input:types.input.Row}){const snapshot=await ctx.fns.input.batchSnapshot({id:opts.input.id});return snapshot.history as types.input.HistorySummary??null;},
 open(_ctx:Context,opts:{input:types.input.Row}){return '<p><a target="_top" href="/?agent='+encodeURIComponent(opts.input.agentId)+'">Open questions in the chat</a></p>';},
 async submit(){throw new Error('Use dedicated batch controls');},
 done(){return '<p>Batch closed.</p>';}
} satisfies types.input.Kind;
