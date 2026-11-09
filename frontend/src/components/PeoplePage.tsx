import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestJson } from '../sdk/api';
import { subscribeLive } from '../sdk/live';
import './people-draft.css';
type Person = { id:string; name:string; email:string|null; role:string; disabledAt:number|null; hasPassword:boolean; providers:string[] };
type People = { meId:string; csrfToken:string; google:null|{domain:string;autoCreate:boolean}; users:Person[] };
/** Owner administration; all authorization is repeated by the HTTP endpoints. */
export function PeoplePage() {
  const [data,setData]=useState<People|null>(null), [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const [onlineIds,setOnlineIds]=useState<string[]|null>(null);
  const lock=useRef(false);
  useEffect(()=>{
    let disposed=false;
    let pending:AbortController|undefined;
    const refresh=()=>{
      pending?.abort();
      const controller=new AbortController(); pending=controller;
      void requestJson<{onlineIds:string[]}>('/auth/online',{signal:controller.signal}).then(result=>{
        if(!disposed&&!controller.signal.aborted)setOnlineIds(result.onlineIds);
      }).catch(()=>{if(!disposed&&!controller.signal.aborted)setOnlineIds(null);});
    };
    refresh();
    const unsubscribe=subscribeLive({name:'people-presence',types:['presence'],onEvent:refresh,resync:refresh,onError:()=>{if(!disposed)setOnlineIds(null);}});
    return ()=>{disposed=true;pending?.abort();unsubscribe();};
  },[]);
  const load=()=>requestJson<People>('/auth/users').then(setData);
  useEffect(()=>{ void load().catch(e=>setError(String(e.message))); },[]);
  async function submit(values:Record<string,string>, form?:HTMLFormElement) {
    if(lock.current || !data)return; lock.current=true;setBusy(true);setError('');setNotice('');
    try { const result=await requestJson<{ok:string}>('/auth/users',{method:'POST',body:values,csrfToken:data.csrfToken});setNotice(result.ok);if(values.action==='add')form?.reset();await load(); }
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}
  }
  const onSubmit=(action:string)=>(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;void submit({...Object.fromEntries(new FormData(form)) as Record<string,string>,action},form);};
  const me=data?.users.find(u=>u.id===data.meId);
  return <section className="people-draft-page" aria-label="People" data-live-topic="presence"><h1>People</h1><p>Everyone here is a trusted team member. All chats are visible to everyone and use the Hyper owner’s subscriptions. There is no isolation between people.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data?<p role="status">{error?'People unavailable':'Loading people…'}</p>:<>
    <div className="people-table"><table><caption className="sr-only">Team accounts</caption><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Sign-in</th><th>Actions</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id}><th scope="row">{u.name}<small>{u.id}</small><small>{onlineIds===null?'Presence unavailable':onlineIds.includes(u.id)?'Online':'Offline'}</small></th><td>{u.email||'—'}</td><td>{u.role}{u.disabledAt?' · disabled':''}</td><td>{[u.hasPassword?'password':'',...u.providers].filter(Boolean).join(', ')||'—'}</td><td>{u.id===data.meId?'You':<><button disabled={busy} onClick={()=>void submit({action:u.disabledAt?'enable':'disable',id:u.id})}>{u.disabledAt?'Enable':'Disable'}</button><button disabled={busy} onClick={()=>void submit({action:'role',id:u.id,role:u.role==='owner'?'member':'owner'})}>Make {u.role==='owner'?'member':'owner'}</button></>}</td></tr>)}</tbody></table></div>
    <div className="people-forms"><form onSubmit={onSubmit('add')}><h2>Add a person</h2><label>Name<input name="name" required autoComplete="off" /></label><label>Email<input name="email" type="email" required autoComplete="off" /></label><label>Password{data.google?' (optional)':''}<input name="password" type="password" minLength={8} required={!data.google} autoComplete="new-password" /></label><button disabled={busy}>Add person</button></form>
    {me&&<form key={me.name+me.email} onSubmit={onSubmit('me')}><h2>Your account</h2><label>Name<input name="name" required defaultValue={me.name} autoComplete="name" /></label><label>Email<input name="email" type="email" defaultValue={me.email||''} autoComplete="email" /></label><label>New password (leave empty to keep)<input name="password" type="password" minLength={8} autoComplete="new-password" /></label><button disabled={busy}>Save account</button></form>}</div>
    <p>Google sign-in: {data.google?`on, ${data.google.domain} accounts${data.google.autoCreate?' (new accounts added automatically)':''}`:'off'}.</p></>}
  </section>;
}
