import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestJson } from '../sdk/api';
import './people-draft.css';
type Draft = { title:string; model:string; state:string; csrfToken:string; chats:{id:string;title:string}[]; agentId?:string };
/** Browser-tab draft: opening never creates an agent; the server claims the first send once. */
export function SidebarDraftPage({bindingId,onCreated}:{bindingId:string;onCreated:(id:string)=>void}) {
  const [data,setData]=useState<Draft|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
  const lock=useRef(false), created=useRef(onCreated);created.current=onCreated;
  const path='/sidebar/draft/'+encodeURIComponent(bindingId);
  useEffect(()=>{const abort=new AbortController();setError('');void requestJson<Draft>(path,{signal:abort.signal}).then(d=>{if(d.agentId)created.current(d.agentId);else setData(d);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[path]);
  async function send(form:FormData){
    if(lock.current||!data)return;lock.current=true;setBusy(true);setError('');
    try {const response=await fetch(path,{method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',headers:{Accept:'application/json','X-CSRF-Token':data.csrfToken},body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||'Submission failed');if(!result.agentId)throw new Error('Missing agent result');created.current(result.agentId);}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}
  }
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();void send(new FormData(e.currentTarget));};
  const blocked=busy||!!data&&data.state!=='draft';
  return <section className="people-draft-page" aria-label="Browser tab chat"><h1>{data?.title||'Browser tab chat'}</h1>{error&&<p role="alert">{error}</p>}{!data?<p role="status">{error?'Draft unavailable':'Loading draft…'}</p>:<><p>{data.model}</p>{data.state!=='draft'&&<p role="status">First submission {data.state}. Reopen this page to inspect its result; do not resend automatically.</p>}
    <label>Find an existing chat<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label><ul>{data.chats.filter(c=>(c.title+' '+c.id).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(c=><li key={c.id}><button disabled={blocked} onClick={()=>{const f=new FormData();f.set('action','attach');f.set('existingAgent',c.id);void send(f);}}>{c.title||'Untitled'} · {c.id}</button></li>)}</ul>
    <form onSubmit={submit}><label>First message<textarea name="text" rows={5} /></label><label>Attachments<input name="files" type="file" multiple /></label><button disabled={blocked}>{busy?'Creating chat…':'Send and create chat'}</button></form></>}
  </section>;
}
