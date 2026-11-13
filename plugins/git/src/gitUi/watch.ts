import {watch as watchFs} from 'node:fs';
import path from 'node:path';
/**
 * Touch a shared local or SSH repository live subscription.
 *
 * Use after authorizing a pinned snapshot. Shares watchers across tabs and hot reload, debounces events, expires after ten idle minutes, and never falls back from SSH to local files.
 * Native watchers cover HEAD, index, refs and packed-refs; SSH and native-watcher failures poll HEAD, status and ref identities (for-each-ref, at most 2001 refs) every three seconds through bounded Git commands, so ref-only moves refresh without fetch: successive dirty edits with unchanged status may require manual refresh. Closing suppresses pending results and further commands; an in-flight command retains its transport timeout.
 * @param opts.host Pinned local host or SSH alias.
 * @param opts.dir Pinned absolute repository directory.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned local host or SSH alias. */
        host: string;
        /** Pinned absolute repository directory. */
        dir: string;
    },
): Promise<{key:string;state:'watching'|'polling'|'error';error?:string}> {
    if(!opts.dir.startsWith('/')||!/^[A-Za-z0-9_.-]+$/.test(opts.host))throw new Error('Invalid repository target');
     const key=new Bun.CryptoHasher('sha256').update(JSON.stringify([opts.host,opts.dir])).digest('hex').slice(0,16);
     const entries=ctx.state.gitUi.watchers??=new Map();
     const existing=entries.get(key);
     if(existing){existing.touch();await existing.ready;return {key,state:existing.state,...(existing.error?{error:existing.error}:{})};}
     let closed=false,busy=false,previous:string|undefined;
     let idle:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined,poll:ReturnType<typeof setInterval>|undefined;
     const natives:ReturnType<typeof watchFs>[]=[];
     const changed=()=>{if(closed)return;if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{debounce=undefined;if(!closed)ctx.fns.procs.events.emit({event:{type:'gitUi.changed',key}});},300);debounce.unref();};
     const entry:NonNullable<types.gitUi.State['watchers']> extends Map<string,infer E>?E:never={key,state:'polling',ready:Promise.resolve(),touch:()=>{if(idle)clearTimeout(idle);idle=setTimeout(()=>entry.close(),600000);idle.unref();},close:()=>{closed=true;for(const w of natives)w.close();natives.length=0;if(idle)clearTimeout(idle);if(debounce)clearTimeout(debounce);if(poll)clearInterval(poll);if(entries.get(key)===entry)entries.delete(key);}};
     entries.set(key,entry);entry.touch();
     const run=(args:string[],allowFailure=false)=>ctx.fns.gitUi.command({...opts,args,allowFailure});
     const fingerprint=async()=>{if(closed||busy)return;busy=true;try{
     const head=await run(['rev-parse','--verify','HEAD'],true);
     if(closed)return;
     const status=await run(['status','--porcelain=v2','-z','--untracked-files=all']);
     if(closed)return;
     // Ref-only moves (branch/tag/remote-tracking updates without worktree edits) must refresh decorations too.
     // Same bounded transport and ref cap as gitUi.refs; a lookup failure is hashed, not fatal, so commits stay visible.
     const refs=await run(['for-each-ref','--count=2001','--format=%(refname)%00%(objectname)%00%(symref)','refs/heads','refs/remotes','refs/tags'],true);
     if(closed)return;
     // Both transports use bounded Git output, not a filesystem scan. Porcelain
     // does not distinguish successive edits to an already dirty file.
     const next=new Bun.CryptoHasher('sha256').update(JSON.stringify([head.code,head.stdout,status.stdout,refs.code,refs.stdout])).digest('hex');
     if(previous!==undefined&&previous!==next)changed();previous=next;
     if(entry.state==='error'){entry.state='polling';delete entry.error;changed();}
     }catch(error){if(!closed){entry.state='error';entry.error=error instanceof Error?error.message:String(error);changed();}}finally{busy=false;}};
     const fallback=()=>{for(const w of natives)w.close();natives.length=0;if(closed||poll)return;entry.state='polling';poll=setInterval(()=>{void fingerprint();},3000);poll.unref();};
     entry.ready=(async()=>{
     if(opts.host!=='local'){fallback();await fingerprint();return;}
     try{
     const gitDir=(await run(['rev-parse','--absolute-git-dir'])).stdout.trim();
     if(closed)return;
     const common=path.resolve(opts.dir,(await run(['rev-parse','--git-common-dir'])).stdout.trim());
     if(closed)return;
     const attach=(dir:string,metadata:boolean)=>{
     const w=watchFs(dir,{recursive:true},(_event,filename)=>{
     const name=String(filename??'').replaceAll('\\','/');
     if(/(^|\/)\.git\/(objects|logs)(\/|$)/.test(name))return;
     if(metadata&&name&&!/^(HEAD|index|packed-refs)(\/|$)|^refs(\/|$)/.test(name))return;
     changed();});
     w.on('error',()=>{changed();fallback();void fingerprint();});w.unref();natives.push(w);
     };
     attach(opts.dir,false);for(const dir of new Set([gitDir,common]))attach(dir,true);entry.state='watching';
     }catch(error){fallback();await fingerprint();}
     })();await entry.ready;
     return {key,state:entry.state,...(entry.error?{error:entry.error}:{})};
}
