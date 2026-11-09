import { useEffect, useState, type FormEvent } from 'react';
import { Button, Panel, TextField, requestJson, type UiExtension } from '@hyper/ui';

type Hit = {agentId:string;idx:number;role:string;score:number;snippet:string};
type Schema = {type?:string;description?:string;enum?:unknown[];anyOf?:Schema[];items?:Schema;'x-typescript-type'?:string};
type Doc = {name:string;summary?:string;doc?:string;optsType?:string;returnType?:string;abs?:string;rel?:string;line?:number;paramsSchema?:{properties?:Record<string,Schema>;required?:string[]};ranking?:{score?:number;bm25?:number;similarity?:number}};
type Data = {hits?:Hit[];docs?:Doc[];namespaces?:string[]};
function schemaType(schema:Schema):string {
  return schema['x-typescript-type'] || (schema.type === 'array' ? `${schemaType(schema.items ?? {})}[]` : schema.enum ? schema.enum.map(value=>JSON.stringify(value)).join(' | ') : schema.anyOf ? schema.anyOf.map(schemaType).join(' | ') : schema.type || 'unknown');
}
function SearchPage({functions=false}:{functions?:boolean}) {
  const initial = new URLSearchParams(window.location.search);
  const [q,setQ]=useState(initial.get('q') ?? '');
  const [filter,setFilter]=useState(initial.get(functions?'namespace':'agent') ?? '');
  const [query,setQuery]=useState(()=>new URLSearchParams({q,[functions?'namespace':'agent']:filter}).toString());
  const [data,setData]=useState<Data | null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true); setError(''); setData(null);
    void requestJson<Data>(`/${functions?'functions':'search'}?${query}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:String(cause));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[query,functions]);
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    const params=new URLSearchParams({q,[functions?'namespace':'agent']:filter});
    setQuery(params.toString());
    const url=new URL(window.location.href); url.searchParams.set('view',`extension:documentation/${functions?'functions':'search'}`);
    for(const key of ['q','agent','namespace'])url.searchParams.delete(key);
    for(const [key,value] of params)if(value)url.searchParams.set(key,value);
    window.history.replaceState(null,'',url);
  };
  return <Panel title={functions?'Runtime functions':'Transcript search'}>
    <p>{functions?'Live documentation, parameter schemas, return types, and source locations. Search works best with concise English keywords.':'BM25 search across transcripts. Use quoted phrases, AND/OR, or field:term.'}</p>
    <form onSubmit={submit} style={{display:'grid',gap:12,marginBlock:16}}>
      <TextField label="Search" value={q} onChange={event=>setQ(event.target.value)} />
      {functions?<label>Namespace <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="">All namespaces</option>{filter && !data?.namespaces?.includes(filter) && <option value={filter}>{filter}</option>}{data?.namespaces?.map(name=><option key={name} value={name}>{name}</option>)}</select></label>:<TextField label="Agent (optional)" value={filter} onChange={event=>setFilter(event.target.value)} />}
      <Button type="submit">Search</Button>
    </form>
    {loading && <p role="status">Loading…</p>}{error && <p role="alert">{error}</p>}
    {data && <div aria-live="polite"><p>{functions?`${data.docs?.length ?? 0} functions`:`${data.hits?.length ?? 0} results`}</p>
      {data.hits?.map(hit=><article key={`${hit.agentId}:${hit.idx}`} style={{borderTop:'1px solid var(--border)',paddingBlock:12}}><a href={`/?agent=${encodeURIComponent(hit.agentId)}`}>{hit.agentId} · #{hit.idx} · {hit.role}</a><span> · score {hit.score.toFixed(2)}</span><p style={{whiteSpace:'pre-wrap'}}>{hit.snippet.split(/(<b>.*?<\/b>)/gs).map((part,index)=>part.startsWith('<b>') && part.endsWith('</b>')?<mark key={index}>{part.slice(3,-4)}</mark>:part)}</p></article>)}
      {data.docs?.map(doc=><details key={doc.name} style={{borderTop:'1px solid var(--border)',paddingBlock:12}}><summary><strong>{doc.name}</strong> — {doc.summary || doc.doc || 'No description'}</summary>
        {doc.ranking && <p>{doc.ranking.similarity != null && <>RRF {doc.ranking.score} · cosine {doc.ranking.similarity} · </>}{doc.ranking.bm25 != null && <>BM25 {doc.ranking.bm25}</>}</p>}
        {doc.doc && <p style={{whiteSpace:'pre-wrap'}}>{doc.doc}</p>}
        <h3>Signature</h3><pre style={{overflowX:'auto'}}><code>{`await ctx.fns.${doc.name}(\n${doc.optsType || '{}'}\n); // returns ${doc.returnType || 'unknown'}`}</code></pre>
        <h3>Parameters</h3>{Object.entries(doc.paramsSchema?.properties ?? {}).map(([name,schema])=><div key={name}><code>{name}: {schemaType(schema)}</code> · {doc.paramsSchema?.required?.includes(name)?'required':'optional'}{schema.description && <p>{schema.description}</p>}</div>)}
        {!Object.keys(doc.paramsSchema?.properties ?? {}).length && <p>No options</p>}
        <h3>Returns</h3><code>{doc.returnType}</code><h3>Source</h3><a href={`/files?path=${encodeURIComponent(doc.abs || doc.rel || '')}`}>{doc.rel}{doc.line?`:${doc.line}`:''}</a>
      </details>)}
      {!(functions?data.docs?.length:data.hits?.length) && <p>{functions?'No functions found.':'No matches. Enter a query to search transcripts.'}</p>}
    </div>}
  </Panel>;
}
function TranscriptPage(){return <SearchPage />;}
function FunctionsPage(){return <SearchPage functions />;}
export const documentationExtension:UiExtension={id:'documentation',apiVersion:1,pages:[{id:'search',title:'Transcript search',component:TranscriptPage},{id:'functions',title:'Runtime functions',component:FunctionsPage}],navigation:[{page:'search',title:'Transcript search'},{page:'functions',title:'Runtime functions'}]};
