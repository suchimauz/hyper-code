import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { readdir, stat } from 'node:fs/promises';

/** Read bounded, shallow local workspace suggestions for a signed-in user. Recent paths belong only to that user; no files or remote hosts are inspected.
 * @param opts.req GET request with optional q or workspaceDir query (maximum 4096 characters).
 */
export default async function(ctx: Context, _session: Session|null, opts: {/** Incoming HTTP request. */req: Request}): Promise<Response> {
 const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
 const who=await ctx.fns.auth.currentUser({req:opts.req});
 if(!who.required||who.legacy||!who.user||who.user.disabledAt!==null)return reply({message:'Authenticated user session required'},401);
 const url=new URL(opts.req.url); const raw=(url.searchParams.get('q')??url.searchParams.get('workspaceDir')??'').trim();
 if(raw.length>4096||raw.includes('\0')||raw.startsWith('~')&&raw!=='~'&&!raw.startsWith('~/'))return reply({message:'Invalid local path'},400);
 try {
 if(!raw){const rows=await ctx.fns.procs.db.select({sql:"SELECT workspace_dir AS path FROM agents WHERE created_by=? AND archived_at IS NULL AND workspace_dir IS NOT NULL AND workspace_dir<>'' AND COALESCE(workspace_host,'')='' GROUP BY workspace_dir ORDER BY MAX(updated_at) DESC LIMIT 5",params:[who.user.id]});return reply({paths:rows.map(row=>String(row.path)),path:null,status:'empty'});}
 const home=ctx.env.HOME||homedir();const expanded=raw.startsWith('~')?home+raw.slice(1):raw;
 const target=resolve(raw);const info=await stat(target).catch(()=>null);
 let root=isAbsolute(expanded)?resolve(expanded):home;
 while(root!==dirname(root)&&!(await stat(root).catch(()=>null))?.isDirectory())root=dirname(root);
 const entries=await readdir(root,{withFileTypes:true});
 const needle=(isAbsolute(expanded)?expanded.slice(root.length):expanded).toLowerCase().replaceAll('/','');
 const score=(name:string)=>{let at=0,gaps=0;for(const ch of needle){const next=name.toLowerCase().indexOf(ch,at);if(next<0)return Infinity;gaps+=next-at;at=next+1;}return gaps;};
 const paths=entries.filter(e=>e.isDirectory()&&(needle.startsWith('.')||!e.name.startsWith('.'))).map(e=>({path:resolve(root,e.name),score:score(e.name)})).filter(e=>Number.isFinite(e.score)).sort((a,b)=>a.score-b.score||a.path.localeCompare(b.path)).slice(0,20).map(e=>e.path);
 return reply({paths,path:target,status:info?.isDirectory()?'directory':info?'file':'missing'});
 }catch(error){return reply({message:'Unable to inspect local workspace'},(error as {code?:string}).code==='EACCES'?403:400);}
}
