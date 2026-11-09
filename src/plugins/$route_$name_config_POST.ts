/** Save owner-approved declared plugin fields with cookie-bound CSRF; never echo submitted secrets.
 * @param opts.req JSON configuration mutation.
 * @param opts.params Mounted plugin route parameters.
 */
export default async function(ctx:Context, session:Session|null, opts:{
 /** JSON configuration mutation. */ req:Request;
 /** Mounted plugin route parameters. */ params:Record<string,string>;
}):Promise<Response>{
 const req=opts.req;const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    const { user } = who;
 if (who.required && !user && !who.legacy)return reply({error:'Unauthorized'},401);
 if (user && user.role !== 'owner')return reply({error:'Owner access required'},403);
 if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.has('origin')&&req.headers.get('origin')!==await ctx.fns.http.publicOrigin({req})))return reply({error:'Same origin required'},403);
 if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
 const raw=await req.text();if(raw.length>32768)return reply({error:'Request too large'},413);
 try{
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['values','reset'].includes(k)))return reply({error:'Invalid fields'},400);
 if(data.reset!==undefined&&typeof data.reset!=='string')return reply({error:'Invalid reset'},400);
 await ctx.fns.plugins.saveConfiguration({name:opts.params.name!,...data});
 return reply({ok:true});
 }catch{return reply({error:'Configuration could not be saved. Check declared fields and values.'},400);}
}
