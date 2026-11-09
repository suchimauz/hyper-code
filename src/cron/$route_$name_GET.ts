/** Redirect legacy management documents to the native React page.
 * @param opts.req Incoming browser request.
 * @param opts.params Legacy route parameters.
 */
export default async function(_ctx:Context,_session:Session|null,opts:{/** Incoming browser request. */ req:Request;/** Legacy route parameters. */ params:Record<string,string>}):Promise<Response>{
 return new Response(null,{status:302,headers:{Location:'/?view=automation','Cache-Control':'no-store'}});
}
