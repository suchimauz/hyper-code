import { useEffect, useMemo, useRef, useState } from 'react';
import { requestJson, type ExtensionCanvasProps, type ExtensionLauncherProps, type UiExtension } from '@hyper/ui';
import { Diff, Hunk, parseDiff, tokenize } from 'react-diff-view';
import refractor from 'refractor';
import { styles } from './styles';

type File = {path:string;oldPath?:string;status:string;group?:string;special?:string};
type Commit = {hash:string;author:string;date:string;subject:string;parents:string[]};
type Snapshot = {root:string;branch:string;head:string;shallow:boolean;files:File[];commits:Commit[];hasMore:boolean;page:number};
type CommitFiles = {hash:string;comparison:string;files:File[]};
type Patch = {patch:string;state:string;message:string};
function Launcher({context}:ExtensionLauncherProps){
 const [error,setError]=useState('');const sent=useRef(false);
 const open=()=>{if(!context.agentId)return;setError('');requestJson('/gitUi?agentId='+encodeURIComponent(context.agentId),{method:'POST',body:{}}).catch(e=>setError(String(e)));};
 useEffect(()=>{if(!sent.current){sent.current=true;open();}},[context.agentId]);
 return <section className="git-view"><p>{error||'Git opens in a project-bound Canvas tab.'}</p><button onClick={open}>Open Git</button></section>;
}
function PatchView({patch,path,split}:{patch:string;path:string;split:boolean}){
 const rendered=useMemo(()=>{
  try {
   const extension=path.split('.').pop()||'',language=({ts:'typescript',tsx:'tsx',js:'javascript',jsx:'jsx',json:'json',py:'python',sh:'bash',md:'markdown',yml:'yaml',yaml:'yaml',clj:'clojure',css:'css',html:'markup'} as Record<string,string>)[extension];
   return parseDiff(patch).map((file,index)=>{
    const tokens=language&&refractor.registered(language)?tokenize(file.hunks,{highlight:true,refractor,language}):undefined;
    return <Diff key={index} viewType={split?'split':'unified'} diffType={file.type} hunks={file.hunks} tokens={tokens}>{hunks=>hunks.map(hunk=><Hunk key={hunk.content} hunk={hunk}/>)}</Diff>;
   });
  }catch{return <pre>{patch}</pre>;}
 },[patch,path,split]);
 return <div className="git-patch" tabIndex={0} aria-label="File diff with line numbers">{rendered}</div>;
}
function Repository({context,item}:ExtensionCanvasProps){
 const [section,setSection]=useState(item.state.section==='history'?'history':'changes');
 const [selection,setSelection]=useState<{path:string;group:string}|null>(typeof item.state.path==='string'?{path:item.state.path,group:String(item.state.group||'unstaged')}:null);
 const [hash,setHash]=useState(String(item.state.hash||''));const [split,setSplit]=useState(item.state.split===true);
 const [page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[commit,setCommit]=useState<CommitFiles|null>(null),[patch,setPatch]=useState<Patch|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[diffError,setDiffError]=useState(''),[commitError,setCommitError]=useState('');
 const anchor=useRef('');
 const base='/gitUi?agentId='+encodeURIComponent(context.agentId||'')+'&itemId='+item.id;
 const save=(state:Record<string,unknown>)=>{requestJson('/canvas/'+encodeURIComponent(context.agentId||'')+'/item/'+item.id,{method:'POST',body:{state}}).catch(e=>setError('Could not save selection: '+String(e)));};
 useEffect(()=>{let alive=true;setLoading(true);setError('');requestJson<Snapshot>(base+'&op=snapshot&page='+page+(page&&anchor.current?'&anchor='+anchor.current:''))
  .then(data=>{if(alive){setSnapshot(data);if(!page)anchor.current=data.head;}}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[base,page,refresh]);
 useEffect(()=>{let alive=true;setCommit(null);setCommitError('');if(section==='history'&&hash)requestJson<CommitFiles>(base+'&op=commit&hash='+encodeURIComponent(hash)).then(data=>{if(alive)setCommit(data);}).catch(e=>{if(alive)setCommitError(String(e));});return()=>{alive=false;};},[base,section,hash,refresh]);
 useEffect(()=>{let alive=true;setPatch(null);setDiffError('');if(selection)requestJson<Patch>(base+'&op=diff&path='+encodeURIComponent(selection.path)+'&group='+selection.group+(selection.group==='commit'?'&hash='+encodeURIComponent(hash):''))
  .then(data=>{if(alive)setPatch(data);}).catch(e=>{if(alive)setDiffError(String(e));});return()=>{alive=false;};},[base,selection,hash,refresh]);
 const pick=(file:File,group:string)=>{setSelection({path:file.path,group});save({path:file.path,group});};
 const files=(list:File[],group:string)=><ul className="git-files">{list.map(file=><li key={group+file.path}><button aria-pressed={selection?.path===file.path&&selection.group===group} onClick={()=>pick(file,group)}><span className="git-status">{file.status}</span><span>{file.oldPath&&<small>{file.oldPath} → </small>}{file.path}{file.special&&<small> · {file.special}</small>}</span></button></li>)}</ul>;
 return <section className="git-view" data-theme={context.theme}><style>{styles}</style>
  <header><div><strong>Git · {String(item.args.dir)}</strong><small>{String(item.args.host)} · {snapshot?.branch||'Repository'} · Read only</small></div><button disabled={loading} onClick={()=>{setPage(0);anchor.current='';setRefresh(v=>v+1);}}>Refresh</button></header>
  <nav aria-label="Git section">{['changes','history'].map(value=><button key={value} aria-pressed={section===value} onClick={()=>{setSection(value);setSelection(null);save({section:value,path:null});}}>{value==='changes'?'Changes':'History'}</button>)}<span/ ><button aria-pressed={split} onClick={()=>{setSplit(!split);save({split:!split});}}>{split?'Split':'Unified'}</button></nav>
  {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading repository…</p>}{snapshot?.shallow&&<p className="git-note">Shallow repository — older history and parents may be unavailable.</p>}
  <div className="git-columns"><aside aria-label={section==='changes'?'Changed files':'Commit history'}>
   {section==='changes'&&snapshot&&(['staged','unstaged','untracked'].map(group=><section key={group}><h3>{group} <small>{snapshot.files.filter(f=>f.group===group).length}</small></h3>{files(snapshot.files.filter(f=>f.group===group),group)}</section>))}
   {section==='history'&&<><ol className="git-commits">{snapshot?.commits.map(c=><li key={c.hash}><button aria-pressed={hash===c.hash} onClick={()=>{setHash(c.hash);setSelection(null);save({hash:c.hash,path:null});}}><strong>{c.subject}</strong><small>{c.hash.slice(0,8)} · {c.author} · {c.date.slice(0,10)}</small></button></li>)}</ol>{snapshot&&!snapshot.commits.length&&<p>No commits.</p>}<div className="git-pages"><button disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button disabled={!snapshot?.hasMore||loading||page>=200} onClick={()=>setPage(p=>p+1)}>Next</button></div>{commitError&&<p role="alert">{commitError}</p>}{hash&&!commit&&!commitError&&<p role="status">Loading commit…</p>}{commit&&<><h3>{commit.hash.slice(0,8)}</h3><p className="git-note">{commit.comparison}</p>{files(commit.files,'commit')}</>}</>}
  </aside><main aria-label="Selected diff"><h3>{selection?.path||'Select a file'}</h3>{diffError&&<p role="alert">{diffError}</p>}{selection&&!patch&&!diffError&&<p role="status">Loading diff…</p>}{patch&&(patch.state==='text'?<PatchView patch={patch.patch} path={selection?.path||''} split={split}/>:<p role="status">{patch.message}</p>)}</main></div>
 </section>;
}
const extension:UiExtension={id:'git',apiVersion:1,canvasLaunchers:[{id:'git',title:'Git',description:'Read-only project changes and commit history',component:Launcher}],canvasKinds:[{kind:'gitUi.repository',component:Repository}]};
export default extension;
