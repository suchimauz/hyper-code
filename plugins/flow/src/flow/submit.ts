/**
 * Submit a revision-bound form and return a durable structured receipt.
 * Validates before claiming; after a claim, unknown outcomes never permit blind retries.
 * Legacy declaration HTML is returned only as compatibility data, never interpreted as success.
 * @param opts.fields Unique form fields including target and submission identity.
 */
export default async function(ctx:Context,session:Session|null,opts:{
 /** Unique form fields including target and submission identity. */ fields:Record<string,string>;
}):Promise<{submissionId:string;flow:string;target:{id:string;revision:string};status:'validation'|'stale'|'closed'|'remains'|'unconfirmed'|'pending'|'legacy';message:string;errors?:Record<string,string>;values?:Record<string,string>;receiptHtml?:string}>{
 const f=opts.fields,flow=f.flow??'',target={id:f.id??'',revision:f.revision??''},submissionId=f.submissionId??'';
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(flow)||!target.id||target.id.length>1024||!target.revision||target.revision.length>1024||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId))throw new Error('Invalid form identity');
 const identity={submissionId,flow,target},payload=JSON.stringify(Object.entries(f).sort(([a],[b])=>a.localeCompare(b)));
 const retry=(r:{payload?:string;receipt?:Awaited<ReturnType<typeof ctx.fns.flow.submit>>;html?:string})=>{if(r.payload!==payload)throw new Error('Submission identity already used with different values');return r.receipt??{...identity,status:r.html?'legacy' as const:'pending' as const,message:'Previous submission must be checked against current source data. Do not submit again.',...(r.html?{receiptHtml:r.html}:{})};};
 const prior=await ctx.fns.procs.db.select({sql:'SELECT result FROM flow.receipts WHERE id=?',params:[submissionId]});if(prior.length)return retry(prior[0].result);
 await ctx.fns.flow.refresh({});const now=new Date().toISOString();
 const gap=(await ctx.fns.flow.discover({flow,now})).find(g=>g.id===target.id);
 if(!gap||gap.revision!==target.revision)return{...identity,status:'stale',message:'Data changed. Nothing recorded. Refresh and review the current card.'};
 if(!gap.form||gap.form.id!==f.action)throw new Error('Form action unavailable');
 const allowed=new Set(['flow','id','revision','action','submissionId',...gap.form.fields.map(x=>'field.'+x.name)]);
 if(Object.keys(f).some(k=>!allowed.has(k)))throw new Error('Unexpected form field');
 const values:Record<string,string>={},errors:Record<string,string>={};
 for(const field of gap.form.fields){const value=f['field.'+field.name]??'';values[field.name]=value;if(field.type==='text'){if(value.length>field.maxLength||value.includes('\0'))errors[field.name]='Maximum '+field.maxLength+' characters; no null characters.';}else{const checked=await ctx.fns.flow.localInstant({value,timezone:field.timezone,now,min:field.min});if(checked.error)errors[field.name]=checked.error;}}
 if(Object.keys(errors).length)return{...identity,status:'validation',message:'Correct the highlighted fields. Nothing recorded.',errors,values};
 const claimed=await ctx.fns.procs.db.select({sql:'INSERT INTO flow.receipts(id,flow,result) VALUES (?,?,?::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id',params:[submissionId,flow,JSON.stringify({payload,status:'pending'})]});
 if(!claimed.length){const row=await ctx.fns.procs.db.select({sql:'SELECT result FROM flow.receipts WHERE id=?',params:[submissionId]});return retry(row[0].result);}
 let receipt:Awaited<ReturnType<typeof ctx.fns.flow.submit>>;
 try{
 const output=await ctx.state.flow.declarations[flow]!.fn(ctx,session,{mode:'submit',now,target,action:gap.form.id,values,submissionId});
 // A declaration's validation is after claim: never unlock a potentially effected action.
 if(output.receipt){const r=output.receipt;receipt={...r,...identity,status:r.status==='validation'?'unconfirmed':r.status};}
 else if(typeof output.html==='string')receipt={...identity,status:'legacy',message:'Legacy handler returned feedback. Check the source record before another action.',receiptHtml:output.html};
 else throw new Error('Handler did not return a receipt');
 }catch{receipt={...identity,status:'unconfirmed',message:'Result not confirmed. Refresh and inspect the source record before another action.'};}
 await ctx.fns.procs.db.run({sql:'UPDATE flow.receipts SET result=?::jsonb WHERE id=?',params:[JSON.stringify({payload,status:'completed',receipt}),submissionId]});
 await ctx.fns.flow.refreshCount({force:true});return receipt;
}
