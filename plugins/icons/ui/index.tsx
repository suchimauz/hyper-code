import { useEffect, useState } from 'react';
import { Button, Panel, TextField, requestJson, type ExtensionCanvasProps, type UiExtension } from '@mauzcode/ui';

type Icon = {name:string;tags:string[]};
function IconsCanvas(){const [rows,setRows]=useState<Icon[]>([]),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[svg,setSvg]=useState(''),[error,setError]=useState('');useEffect(()=>{const c=new AbortController();void requestJson<Icon[]>('/icons/catalog',{signal:c.signal}).then(setRows).catch(e=>{if(!c.signal.aborted)setError(String(e));});return()=>c.abort();},[]);useEffect(()=>{setSvg('');if(!selected)return;const c=new AbortController();void requestJson<{svg:string}>(`/icons/svg?name=${encodeURIComponent(selected)}`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setSvg(r.svg);}).catch(e=>{if(!c.signal.aborted)setError(String(e));});return()=>c.abort();},[selected]);const visible=rows.filter(r=>`${r.name} ${r.tags.join(' ')}`.includes(query.toLowerCase()));const src=svg?`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`:undefined;
 return <Panel title="Lucide icons"><TextField label="Search icon names and tags" placeholder="Search names and tags" value={query} onChange={e=>setQuery(e.target.value)}/>{error&&<p role="alert">{error}</p>}<p>{visible.length} icons</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}><div style={{maxHeight:480,overflow:'auto'}}>{visible.map(r=><div key={r.name}><Button onClick={()=>setSelected(r.name)}>{r.name}</Button><small>{r.tags.join(', ')}</small></div>)}</div>{selected&&<section aria-label="Selected icon"><h3>{selected}</h3>{src&&<><img src={src} width={128} height={128} alt={selected}/><p><a href={src} download={`${selected}.svg`}>Download SVG</a></p><pre>{svg}</pre></>}</section>}</div></Panel>;
}

/** Icons plugin UI: the icons.browser Canvas kind. */
const extension:UiExtension={id:'icons',apiVersion:1,canvasKinds:[{kind:'icons.browser',component:IconsCanvas}]};
export default extension;
