import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Stages a clean fast-forward update for the launchd supervisor and exits with its dedicated update code. */
export default async function(ctx:Context,session:Session|null,opts:{/** Incoming owner-confirmed JSON request. */req:Request;/** Route parameters. */params:Record<string,string>}) {
    if(session?.user?.role !== 'owner') return Response.json({error:'Owners only'},{status:403});
    if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('X-CSRF-Token')??''})) return Response.json({error:'Invalid CSRF token'},{status:403});
    let input: { confirmed?: boolean; target?: string };
    try { input=await opts.req.json(); } catch { return Response.json({error:'Invalid JSON'},{status:400}); }
    if(input?.confirmed!==true || typeof input.target!=='string') return Response.json({error:'Explicit confirmation and target required'},{status:400});
    const s=await ctx.fns.update.check({fetch:true});
    if(s.state!=="available"||!s.current||!s.target||s.target!==input.target) return Response.json({error:'Update changed; refresh and confirm again. '+s.message},{status:409});
    const root=String((ctx.state as any).root??process.cwd());
    const changed=await ctx.fns.git.run({args:["diff","--name-only",`${s.current}..${s.target}`],dir:root,host:"local"});
    const files=changed.stdout.split("\n").filter(Boolean);
    const migrationsChanged=files.some(file=>/(?:^|\/)\$migration_[^/]+\.ts$/.test(file));
    const runtime=join(root,".runtime");
    await mkdir(runtime,{recursive:true});
    await writeFile(join(runtime,"update-pending.json"),JSON.stringify({version:1,old:s.current,target:s.target,upstream:s.upstream,requestedAt:Date.now(),lockChanged:files.includes("bun.lock")||files.includes("bun.lockb"),migrationsChanged})+"\n",{mode:0o600});
    setTimeout(async()=>{try{await ctx.fns.procs.lifecycle.stop({});}finally{process.exit(75);}},100);
    return Response.json({message:'Update staged; MauzCode is restarting…'},{status:202});
}
