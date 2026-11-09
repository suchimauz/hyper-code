/** Submit one confirmed bounded declaration form with owner and cookie-bound CSRF checks. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Browser form snapshot. */req:Request}):Promise<Response>{
const denied=await ctx.fns.flow.authorize({req:opts.req,write:true});if(denied)return denied;
if(!opts.req.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
const reader=opts.req.body?.getReader();let text='';if(reader){const decoder=new TextDecoder();let bytes=0;while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>16384){await reader.cancel();return Response.json({error:'Form too large'},{status:413});}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
try{const body=JSON.parse(text);if(body.confirm!==true||!body.fields||Array.isArray(body.fields)||typeof body.fields!=='object')throw new Error('Explicit form confirmation required');const fields:Record<string,string>=Object.create(null);for(const [key,value]of Object.entries(body.fields)){if(typeof value!=='string'||value.length>2048)throw new Error('Invalid field');fields[key]=value;}
const receipt=await ctx.fns.flow.submit({fields});return Response.json(receipt,{headers:{'Cache-Control':'no-store'}});
}catch(error){return Response.json({error:String(error instanceof Error?error.message:error)},{status:400});}
}
