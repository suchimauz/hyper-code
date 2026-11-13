/**
 * Serve authenticated Git reads, comment mutations and workspace-bound tab opening.
 * Authorize the agent before resolving pinned targets; require CSRF for every POST.
 * Browser host and directory fields are never forwarded. All errors are no-store JSON.
 * @param opts.req Incoming same-origin JSON transport request.
 */
export default async function(ctx:Context,session:Session|null,opts:{
 /** Incoming same-origin JSON transport request. */
 req:Request;
}):Promise<Response>{
 const reply=(data:object,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
 const url=new URL(opts.req.url),agentId=url.searchParams.get('agentId')||'',op=url.searchParams.get('op')||'';
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(agentId))return reply({error:'Invalid agent'},400);
 const denied=await ctx.fns.canvas.authorizeHttp({req:opts.req,agentId});if(denied)return reply({error:'Access denied'},denied.status);
 if(!['GET','POST'].includes(opts.req.method))return reply({error:'Method not allowed'},405);
 if(opts.req.method==='POST'){
  if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid CSRF token'},403);
  if(!op){
   const active=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL',params:[agentId]});
   if(!active.length)return reply({error:'Agent is unavailable'},403);
   return reply(await ctx.fns.canvas.show({agentId,kind:'gitUi.repository',args:{}}));
  }
 }
 // Chat card details resolve their own repository from the persisted reference and still require an open owned tab.
 if(opts.req.method==='GET'&&op==='reviewCard')return reply(await ctx.fns.gitUi.reviewCard({agentId,eventIdx:Number(url.searchParams.get('eventIdx'))}));
 const itemId=Number(url.searchParams.get('itemId'));
 const {dir,host}=await ctx.fns.gitUi.ownedItem({agentId,itemId});
 const target={agentId,itemId};let data:object;
 if(opts.req.method==='POST'){
  const body=await opts.req.json() as {anchor:types.gitUi.CommentAnchor;body:string;id:string;note?:string};if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Expected JSON object');
  if(op==='commentCreate')data=await ctx.fns.gitUi.commentCreate({...target,anchor:body.anchor,body:body.body});
  else if(op==='commentUpdate')data=await ctx.fns.gitUi.commentUpdate({...target,id:body.id,body:body.body});
  else if(op==='commentDelete')data=await ctx.fns.gitUi.commentDelete({...target,id:body.id});
  else if(op==='commentResolve')data=await ctx.fns.gitUi.commentResolve({...target,id:body.id,note:body.note,resolvedBy:'user'});
  else if(op==='commentReopen')data=await ctx.fns.gitUi.commentReopen({...target,id:body.id});
  else if(op==='commentsSend')data=await ctx.fns.gitUi.commentsSend(target);
  else return reply({error:'Unsupported write operation'},400);
 }else if(!op||op==='snapshot'){
  const live=await ctx.fns.gitUi.watch({dir,host});
  try{data={...await ctx.fns.gitUi.snapshot({dir,host,page:Number(url.searchParams.get('page')||0),anchor:url.searchParams.get('anchor')||undefined}),liveKey:live.key,liveState:live.state,...(live.error?{liveError:live.error}:{})};}
  catch(error){return reply({error:error instanceof Error?error.message:String(error),liveKey:live.key,liveState:'error'},400);}
 }
 else if(op==='commit')data=await ctx.fns.gitUi.commit({dir,host,hash:url.searchParams.get('hash')||''});
 else if(op==='diff')data=await ctx.fns.gitUi.diff({dir,host,path:url.searchParams.get('path')||'',group:url.searchParams.get('group')||'',hash:url.searchParams.get('hash')||undefined});
 else if(op==='comments')data=await ctx.fns.gitUi.commentsList({...target,page:Number(url.searchParams.get('page')??0),limit:Number(url.searchParams.get('limit')??100),status:(url.searchParams.get('status')||'open') as 'open'|'resolved'|'all',path:url.searchParams.get('path')??undefined});
 else return reply({error:'Unsupported read operation'},400);
 return reply(data);
 }catch(error){const status=error instanceof Error&&'status' in error?Number(error.status):400;return reply({error:error instanceof Error?error.message:String(error)},[400,403,404,409].includes(status)?status:400);}
}
