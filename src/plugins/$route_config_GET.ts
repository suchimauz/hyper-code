/** Redirect legacy provider configuration navigation to React source inventory.
 * @param opts.req Incoming browser request.
 */
export default async function(_ctx:Context,_session:Session|null,_opts:{/** Incoming browser request. */req:Request}):Promise<Response>{
 return new Response(null,{status:302,headers:{Location:'/?view=plugins&catalogTab=sources','Cache-Control':'no-store'}});
}
