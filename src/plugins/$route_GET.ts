/** Redirect the legacy catalog to React PluginsPage without rendering HTML.
 * @param opts.req Incoming browser request with optional catalog filters.
 */
export default async function(_ctx:Context,_session:Session|null,opts:{/** Incoming browser request with optional catalog filters. */req:Request}):Promise<Response>{
 const url=new URL(opts.req.url); const params=new URLSearchParams({view:'plugins',catalogTab:url.searchParams.get('tab')==='installed'?'sources':'market'});
 for(const key of ['q','provider'])if(url.searchParams.has(key))params.set(key,url.searchParams.get(key)!.slice(0,500));
 return new Response(null,{status:302,headers:{Location:'/?'+params.toString(),'Cache-Control':'no-store'}});
}
