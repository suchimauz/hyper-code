import { useEffect, useId, useState } from 'react';
import { requestJson } from '../../lib/hyper';
type Suggestions = { paths: string[]; path: string|null; status: 'empty'|'directory'|'file'|'missing' };
/** Read-only local path discovery. Creation remains part of the first explicit session submit. */
export function WorkspaceSuggestions({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const list=useId(); const [data,setData]=useState<Suggestions|null>(null);const [error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();setData(null);setError('');const timer=setTimeout(()=>{void requestJson<Suggestions>(`/agent/dirs?q=${encodeURIComponent(value)}`,{signal:abort.signal}).then(s=>{if(!abort.signal.aborted)setData(s);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:String(e));});},150);return()=>{clearTimeout(timer);abort.abort();};},[value]);
 return <><label>Custom local workspace<input list={list} value={value} onChange={e=>onChange(e.target.value)} placeholder="Leave empty to use the project workspace" /></label><datalist id={list}>{data?.paths.map(path=><option key={path} value={path}/>)}</datalist>{error&&<p role="status">Workspace suggestions unavailable: {error}. You can still enter a custom path.</p>}{data&&data.status!=='empty'&&<p role="status">{data.status==='directory'?'Directory exists':data.status==='file'?'Path exists but is not a directory':'Directory does not exist; select the creation checkbox to create it on submit.'}{data.path&&<> <code>{data.path}</code></>}</p>}</>;
}
