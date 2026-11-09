/** Accept JSON cron actions through the owner and CSRF-protected React API.
 * @param opts.req Incoming JSON mutation request.
 */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming JSON mutation request. */ req:Request}):Promise<Response>{
 const req=opts.req;
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return Response.json({error:'JSON required'},{status:415});
 const raw=await req.text();if(raw.length>4096)return Response.json({error:'Request too large'},{status:413});
 try{const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid body');
 const action=data.enabled===true?'enable':'disable';
 delete data.enabled;
 return ctx.fns.frontendBridge.cronTasks({req:new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({...data,action})})});
 }catch{return Response.json({error:'Invalid cron request'},{status:400});}
}
