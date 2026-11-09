/** Reject retired HTML mutation transport; use the owner-authorized native News JSON API. */
export default async function(_ctx:Context,_session:Session|null,_opts:{/** Incoming obsolete request. */req:Request;/** Legacy path parameters. */params:Record<string,string>}):Promise<Response>{return Response.json({error:"Legacy HTML action retired; use the native News page"},{status:410});}
