import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/hyper';

type Setting = {name:string; secret:boolean; configured:boolean; currentValue?:string|number|boolean|null; source:string; descriptor:{type:string;title?:string;description?:string;options?:string[];min?:number;max?:number}};
type Configuration = {settings:Setting[];secrets:{name:string;title?:string;configured:boolean}[]};
/** Declared plugin settings; credential inputs are always empty and never echoed. */
export function PluginConfiguration({name}:{name:string}) {
 const [config,setConfig]=useState<Configuration|null>(null),[values,setValues]=useState<Record<string,string|boolean|number>>({}),[csrf,setCsrf]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const path=`/plugins/${encodeURIComponent(name)}/config`;
 const load=async(signal?:AbortSignal)=>{const data=await requestJson<{configuration:Configuration;csrfToken:string}>(path,{signal});setConfig(data.configuration);setCsrf(data.csrfToken);setValues(Object.fromEntries(data.configuration.settings.map(s=>[s.name,s.secret?'':s.currentValue??(s.descriptor.type==='boolean'?false:'')])));};
 useEffect(()=>{const c=new AbortController();setConfig(null);setError('');load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[name]);
 const save=async(reset?:string)=>{setBusy(true);setError('');setSaved(false);try{await requestJson(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(reset?{reset}:{values})});await load();setSaved(true);}catch{setError('Could not save configuration. Check values and permissions.');}finally{setBusy(false);}};
 return <section aria-label="Plugin configuration">
 {error&&<p role="alert">{error}</p>}{saved&&<p role="status">Configuration saved.</p>}
 {!config&&!error&&<p role="status">Loading configuration…</p>}
 {config&&<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}><legend>Declared configuration</legend>
 {!config.settings.length&&<p>No editable settings declared.</p>}
 {config.settings.map(s=><div key={s.name} className="plugin-detail-settings"><label><strong>{s.descriptor.title??s.name}</strong><code>{s.name}</code>
 {s.descriptor.type==='boolean'?<input type="checkbox" checked={values[s.name]===true} onChange={e=>setValues(v=>({...v,[s.name]:e.target.checked}))}/>:s.descriptor.type==='enum'?<select value={String(values[s.name]??'')} onChange={e=>setValues(v=>({...v,[s.name]:e.target.value}))}>{s.descriptor.options?.map(o=><option key={o}>{o}</option>)}</select>:<input type={s.secret?'password':s.descriptor.type==='number'?'number':'text'} autoComplete={s.secret?'new-password':undefined} min={s.descriptor.min} max={s.descriptor.max} step="any" value={String(values[s.name]??'')} placeholder={s.secret?(s.configured?'Configured — leave blank to keep':'Not configured'):undefined} onChange={e=>setValues(v=>({...v,[s.name]:e.target.value}))}/>}
 {s.descriptor.description&&<p>{s.descriptor.description}</p>}{s.secret&&<p>{s.configured?'Configured':'Not configured'} · value is write-only</p>}</label><button type="button" onClick={()=>void save(s.name)}>Reset {s.descriptor.title??s.name}</button></div>)}
 {!!config.settings.length&&<button type="submit">{busy?'Saving…':'Save configuration'}</button>}
 </fieldset>{config.secrets.map(s=><p key={s.name}>{s.title??s.name}: {s.configured?'configured':'missing'} · manage in Secrets</p>)}</form>}
 </section>;
}
