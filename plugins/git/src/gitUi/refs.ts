/**
 * Read HEAD, local branch, remote-tracking branch and tag decorations for Git Canvas history, keyed by full commit ID.
 *
 * Internal Git Canvas history decoration lookup on the pinned local or SSH repository. Uses only bounded read-only rev-parse, for-each-ref and log through gitUi.command (no fetch, no mutation, no host fallback). Symbolic HEAD reports its branch, detached HEAD reports detached, an unborn HEAD has no badge; any other HEAD or symbolic-name lookup failure is returned as error instead of a guessed detached/empty state. Annotated tags, including tags of tags at any depth, are peeled to their final commit: for-each-ref peels fully on current Git; when an older Git dereferences only one layer, all such tags are peeled with one bounded rev-parse plus one log type check (never one request per tag). Tags of trees/blobs and dangling symbolic refs are omitted, symbolic remote aliases such as origin/HEAD keep their target in alias. Full ref names keep colliding short names distinct. At most 2000 refs are inspected in refname order; truncated reports the limit. Failures are returned as error with an empty map so callers can still show commits; key changes whenever HEAD or any inspected ref moves.
 * @param opts.dir Pinned absolute repository directory.
 * @param opts.host Pinned local host or SSH alias; never inferred.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned absolute repository directory. */
        dir: string;
        /** Pinned local host or SSH alias; never inferred. */
        host: string;
    },
): Promise<{byCommit:Record<string,types.gitUi.CommitRef[]>;key:string;truncated:boolean;error?:string}> {
    if(!opts.dir.startsWith('/')||!/^[A-Za-z0-9_.-]+$/.test(opts.host))throw new Error('Invalid repository target');
    const LIMIT=2000;
    const byCommit:Record<string,types.gitUi.CommitRef[]>={};
    try{
     const run=(args:string[])=>ctx.fns.gitUi.command({dir:opts.dir,host:opts.host,args,allowFailure:true});
     const headId=await run(['rev-parse','--verify','--quiet','HEAD^{commit}']);
     const headSym=await run(['rev-parse','--symbolic-full-name','HEAD']);
     const list=await run(['for-each-ref','--count='+(LIMIT+1),'--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(symref)','refs/heads','refs/remotes','refs/tags']);
     if(!list.ok)throw new Error(list.stderr.trim()||'Reference lookup failed');
     // Unborn HEAD is exit 1 with no output; anything else (corrupt repo, SSH/timeout) is a real lookup failure.
     if(!headId.ok&&!(headId.code===1&&!headId.stdout.trim()&&!headId.stderr.trim()))throw new Error(headId.stderr.trim()||'HEAD lookup failed');
     const head=headId.ok?headId.stdout.trim():'';
     if(head&&!headSym.ok)throw new Error(headSym.stderr.trim()||'HEAD name lookup failed');
     const symbolic=head?headSym.stdout.trim():'';
     const lines=list.stdout.split('\n').filter(Boolean);
     const truncated=lines.length>LIMIT;
     const strip=(ref:string,prefix:string)=>ref.slice(prefix.length);
     const add=(hash:string,r:types.gitUi.CommitRef)=>{(byCommit[hash]??=[]).push(r);};
     const currentBranch=symbolic.startsWith('refs/heads/')?strip(symbolic,'refs/heads/'):'';
     if(head)add(head,currentBranch?{kind:'head',name:'HEAD',ref:'HEAD',branch:currentBranch}:{kind:'head',name:'HEAD',ref:'HEAD',detached:true});
     const rows=lines.slice(0,LIMIT).map(line=>line.split('\u0000'));
     // Older Git dereferences only one tag layer (%(*objecttype)=tag). Peel all such nested tags at once:
     // one rev-parse <tag object>^{} for their final objects, one log --no-walk to keep only commits (trees/blobs drop out).
     const nested=[...new Set(rows.filter(r=>r[2]==='tag'&&r[4]==='tag').map(r=>r[1]!).filter(o=>/^[a-f0-9]{40,64}$/.test(o)))];
     const finalOf:Record<string,string>={};
     if(nested.length){
      const peel=await run(['rev-parse',...nested.map(o=>o+'^{}')]);
      if(!peel.ok)throw new Error(peel.stderr.trim()||'Tag peeling failed');
      const finals=peel.stdout.split('\n').filter(Boolean);
      if(finals.length!==nested.length)throw new Error('Tag peeling returned an unexpected result');
      const unique=[...new Set(finals)];
      const commits=await run(['log','--no-walk=unsorted','--format=%H',...unique,'--']);
      if(!commits.ok)throw new Error(commits.stderr.trim()||'Tag peeling failed');
      const isCommit=new Set(commits.stdout.split('\n').filter(Boolean));
      nested.forEach((o,i)=>{if(isCommit.has(finals[i]!))finalOf[o]=finals[i]!;});
     }
     for(const [ref='',object='',type='',peeled='',peeledType='',symref='']of rows){
      // Annotated tags (also nested) peel to their final object; trees, blobs and dangling symbolic refs are skipped.
      const target=type==='commit'?object:type==='tag'&&peeledType==='commit'?peeled:type==='tag'&&peeledType==='tag'?finalOf[object]??'':'';
      if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(target))continue;
      const alias=symref.startsWith('refs/remotes/')?strip(symref,'refs/remotes/'):symref.startsWith('refs/heads/')?strip(symref,'refs/heads/'):undefined;
      if(ref.startsWith('refs/heads/'))add(target,{kind:'branch',name:strip(ref,'refs/heads/'),ref,...(ref===symbolic?{current:true}:{}),...(alias?{alias}:{})});
      else if(ref.startsWith('refs/remotes/'))add(target,{kind:'remote',name:strip(ref,'refs/remotes/'),ref,...(alias?{alias}:{})});
      else if(ref.startsWith('refs/tags/'))add(target,{kind:'tag',name:strip(ref,'refs/tags/'),ref,annotated:type==='tag'});
     }
     const order={head:0,branch:1,remote:2,tag:3};
     for(const refs of Object.values(byCommit))refs.sort((a,b)=>order[a.kind]-order[b.kind]||Number(!!b.current)-Number(!!a.current)||(a.ref<b.ref?-1:a.ref>b.ref?1:0));
     const key=new Bun.CryptoHasher('sha256').update(JSON.stringify([head,symbolic,list.stdout])).digest('hex').slice(0,16);
     return {byCommit,key,truncated};
    }catch(error){
     return {byCommit:{},key:'',truncated:false,error:error instanceof Error?error.message:String(error)};
    }
}
