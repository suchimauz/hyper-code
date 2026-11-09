/** Redirect legacy management documents to the native React page.
 * @param opts.req Incoming browser request.
 * @param opts.params Legacy route parameters.
 */
export default async function(_ctx:Context,_session:Session|null,opts:{/** Incoming browser request. */ req:Request;/** Legacy route parameters. */ params:Record<string,string>}):Promise<Response>{
 return new Response(null,{status:302,headers:{Location:'/?view=plugins&plugin='+encodeURIComponent(opts.params.name??'')+'&tab='+encodeURIComponent(new URL(opts.req.url).searchParams.get('tab')??'overview'),'Cache-Control':'no-store'}});
}
