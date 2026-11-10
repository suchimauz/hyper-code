import { useEffect, useState } from 'react';
import { Button, Panel, TextField, requestJson, type ExtensionCanvasProps, type UiExtension } from '@mauzcode/ui';

type Node = {id:string;functions:number;incoming:number;outgoing:number;entryPoints:number;roots:string[]};
type Edge = {source:string;target:string;weight:number;samples:{rel:string;line:number}[]};
type MapData = {graph:{nodes:Node[];edges:Edge[];cycles:string[][];totals:{indexedFunctions:number;modules:number;dependencies:number;cycles:number}};boundary:{total:number;violations:{caller:string;callee:string}[]}};

function useData<T>(url:string) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    void requestJson<T>(url,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:String(cause));});
    return ()=>controller.abort();
  },[url,revision]);
  return {data,error,refresh:()=>setRevision(value=>value+1)};
}
type CanvasBinding = { canvas?: ExtensionCanvasProps; context?: ExtensionCanvasProps['context'] };
function useViewState<T>(canvas: ExtensionCanvasProps | undefined, key: string, fallback: T): [T,(value:T)=>void,string] {
  const external = canvas ? {...canvas.item.args,...canvas.item.state}[key] : undefined;
  const [value,setValue]=useState<T>((external as T) ?? fallback),[error,setError]=useState('');
  useEffect(()=>{if(external!==undefined)setValue(external as T);},[external,canvas?.item.id]);
  return [value,(next:T)=>{setValue(next);if(canvas && !canvas.context.readOnly && canvas.context.agentId){
    void requestJson(`/canvas/${encodeURIComponent(canvas.context.agentId)}/item/${canvas.item.id}`,{method:'POST',body:{state:{[key]:next}}}).catch(cause=>setError(String(cause)));
  }},error];
}
function canvasQuery(canvas?:ExtensionCanvasProps) {return canvas ? `&agentId=${encodeURIComponent(canvas.context.agentId ?? '')}&itemId=${canvas.item.id}` : '';}
function ArchitecturePage({canvas}:CanvasBinding = {}) {
  const initial=new URLSearchParams(window.location.search);
  const [scope,setScope,stateError]=useViewState(canvas,'scope',initial.get('scope') || 'all');
  const [weight,setWeight]=useViewState(canvas,'minWeight',Math.max(1,Math.min(50,Number(initial.get('minWeight'))||2)));
  const [search,setSearch]=useViewState(canvas,'search',''),[selected,setSelected]=useViewState(canvas,'selected','');
  const {data,error,refresh}=useData<MapData>(`/architectureMap?minWeight=${weight}${canvasQuery(canvas)}`);
  const nodes=(data?.graph.nodes ?? []).filter(node=>{const core=node.roots.some(root=>root==='core'||root==='mauzcode');return (scope==='all'||(scope==='core'?core:!core)) && node.id.toLowerCase().includes(search.toLowerCase());});
  const ids=new Set(nodes.map(node=>node.id));const edges=(data?.graph.edges ?? []).filter(edge=>ids.has(edge.source)&&ids.has(edge.target));
  const cycles=new Set(data?.graph.cycles.flat() ?? []);const violations=new Set(data?.boundary.violations.map(item=>`${item.caller.split('.')[0]}→${item.callee.split('.')[0]}`) ?? []);
  const chosen=data?.graph.nodes.find(node=>node.id===selected);
  return <Panel title="Архитектура">{stateError && <p role="alert">{stateError}</p>}<div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
    <label>Область <select value={scope} onChange={event=>setScope(event.target.value)}><option value="all">Всё</option><option value="core">Ядро</option><option value="plugins">Плагины</option></select></label>
    <TextField label="Минимальный вес связи" type="number" min={1} max={50} value={weight} onChange={event=>setWeight(Math.max(1,Math.min(50,Number(event.target.value)||1)))}/><TextField label="Найти модуль" value={search} onChange={event=>setSearch(event.target.value)}/><Button onClick={refresh}>Обновить</Button>
  </div>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Загрузка карты…</p>}{data && <>
    <p>{nodes.length} модулей · {edges.length} связей · {data.graph.totals.cycles} циклов · {data.boundary.total} нарушений границ</p>
    <p>Выберите модуль для просмотра зависимостей. Метки «Цикл» и «Граница» указывают на проблемные связи.</p>
    <svg viewBox="0 0 800 600" role="img" aria-label="Граф зависимостей модулей" style={{width:'100%',maxHeight:600}}>
      <defs><marker id="dependency-arrow" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
      {edges.map(edge=>{const a=nodes.findIndex(n=>n.id===edge.source),b=nodes.findIndex(n=>n.id===edge.target),angle=(i:number)=>i/nodes.length*Math.PI*2;return <line key={`${edge.source}/${edge.target}`} x1={400+240*Math.cos(angle(a))} y1={300+240*Math.sin(angle(a))} x2={400+240*Math.cos(angle(b))} y2={300+240*Math.sin(angle(b))} markerEnd="url(#dependency-arrow)" stroke={violations.has(`${edge.source}→${edge.target}`)?'#b07a17':'currentColor'} strokeWidth={Math.min(5,1+Math.log1p(edge.weight))} opacity={!selected||edge.source===selected||edge.target===selected?0.6:0.12}><title>{edge.source} → {edge.target}: {edge.weight}</title></line>;})}
      {nodes.map((node,index)=>{const angle=index/nodes.length*Math.PI*2,x=400+240*Math.cos(angle),y=300+240*Math.sin(angle);return <g key={node.id} role="button" tabIndex={0} aria-label={`Выбрать ${node.id}`} onClick={()=>setSelected(node.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(node.id);}}}><circle cx={x} cy={y} r={Math.min(24,7+Math.sqrt(node.functions))} fill="var(--background, Canvas)" stroke={cycles.has(node.id)?'#d63458':'currentColor'} strokeWidth={selected===node.id?4:2}/><text x={x} y={y+35} textAnchor="middle" fill="currentColor" fontSize="11">{node.id}</text></g>;})}
    </svg>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{nodes.map(node=><Button key={node.id} aria-pressed={selected===node.id} onClick={()=>setSelected(node.id)}>{node.id} · {node.functions}{cycles.has(node.id)?' · Цикл':''}</Button>)}</div>
    {!nodes.length && <p>Модули не найдены.</p>}
    {chosen && <section aria-label="Выбранный модуль"><h2>{chosen.id}</h2><p>{chosen.functions} функций · {chosen.entryPoints} точек входа · {chosen.incoming} входящих · {chosen.outgoing} исходящих</p><p>{chosen.roots.join(', ')}</p></section>}
    <h2>Направленные зависимости</h2><div style={{overflowX:'auto'}}><table><thead><tr><th scope="col">Источник</th><th scope="col">Назначение</th><th scope="col">Вызовы</th><th scope="col">Диагностика</th></tr></thead><tbody>{edges.filter(edge=>!selected||edge.source===selected||edge.target===selected).map(edge=><tr key={`${edge.source}/${edge.target}`}><td>{edge.source}</td><td>{edge.target}</td><td>{edge.weight}</td><td>{violations.has(`${edge.source}→${edge.target}`)?'Граница ':''}<details><summary>Места вызова</summary><ul>{edge.samples.map((sample,index)=><li key={index}>{sample.rel}:{sample.line}</li>)}</ul></details></td></tr>)}</tbody></table></div>{selected && <Button onClick={()=>setSelected('')}>Показать все связи</Button>}
  </>}</Panel>;
}
/** Read-only native architecture pages. */
const visualizationsExtension: UiExtension = {id:'architecture-map',apiVersion:1,canvasKinds:[{kind:'architectureMap.map',component:ArchitectureCanvas},{kind:'architectureMap.turbulence',component:TurbulenceCanvas}],pages:[{id:'architecture',title:'Архитектура',component:ArchitecturePage},{id:'turbulence',title:'Turbulence',component:TurbulencePage}]};

function ArchitectureCanvas(props:ExtensionCanvasProps){return <ArchitecturePage key={props.item.id} canvas={props}/>;}
function TurbulenceCanvas(props:ExtensionCanvasProps){return <TurbulencePage key={props.item.id} canvas={props}/>;}
type TurbulenceFile = {path:string;rel:string;root:string;commits:number;churn:number;complexity:number;worstFunction:number;cognitive:number;nestingMax:number;lines:number;functions:number;danger:number;quadrant:string};
function TurbulencePage({canvas}:CanvasBinding = {}) {
  const [root,setRoot,stateError]=useViewState(canvas,'root',''),[search,setSearch]=useViewState(canvas,'search',''),[selected,setSelected]=useViewState(canvas,'selected','');
  const {data,error,refresh}=useData<{files:TurbulenceFile[]}>(`/architectureMap/turbulence?root=${encodeURIComponent(root)}${canvasQuery(canvas)}`);
  const files=(data?.files ?? []).filter(file=>file.path.toLowerCase().includes(search.toLowerCase()));
  const chosen=files.find(file=>file.path===selected);
  const maxX=Math.max(1,...files.map(file=>Math.log1p(file.commits))),maxY=Math.max(1,...files.map(file=>Math.log1p(file.complexity)));
  return <Panel title="Turbulence"><p>Git churn × cyclomatic complexity · creation commits excluded</p>
    <TextField label="Root" value={root} onChange={e=>setRoot(e.target.value)}/><TextField label="Найти файл" value={search} onChange={e=>setSearch(e.target.value)}/><Button onClick={refresh}>Обновить</Button>
    {(error || stateError) && <p role="alert">{error || stateError}</p>}{!data && !error && <p role="status">Загрузка…</p>}
    <svg viewBox="0 0 800 450" role="img" aria-label="Git churn × complexity" style={{width:'100%',maxHeight:450}}>
      <path d="M40 10V410H790" fill="none" stroke="currentColor"/><text x="330" y="445" fill="currentColor">Git churn (commits)</text><text x="45" y="22" fill="currentColor">Complexity</text>
      {files.map(file=><circle key={file.path} cx={45+Math.log1p(file.commits)/maxX*730} cy={405-Math.log1p(file.complexity)/maxY*370} r={Math.max(3,Math.min(11,Math.sqrt(file.lines)/2))} fill={file.quadrant==='danger'?'#d63458':file.quadrant==='fertile'?'#b07a17':file.quadrant==='cowboy'?'#7560ce':'#26876b'} tabIndex={0} role="button" aria-label={file.path} onClick={()=>setSelected(file.path)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(file.path);}}}><title>{file.path}: {file.commits} commits, complexity {file.complexity}</title></circle>)}
    </svg>
    {chosen && <section><h2>{chosen.path}</h2><p>{chosen.quadrant} · root {chosen.root} · danger {chosen.danger}</p><p>Complexity {chosen.complexity} · worst function {chosen.worstFunction} · cognitive {chosen.cognitive} · nesting {chosen.nestingMax}</p><p>{chosen.lines} lines · {chosen.functions} functions · {chosen.commits} commits · {chosen.churn} changed lines</p><a href={`/files/${encodeURIComponent(chosen.rel)}`} target="_blank" rel="noopener noreferrer">Открыть файл ↗</a></section>}
    <h2>Файлы по риску</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Файл</th><th>Зона</th><th>Commits</th><th>Complexity</th><th>Danger</th></tr></thead><tbody>{[...files].sort((a,b)=>b.danger-a.danger).map(file=><tr key={file.path}><td><Button onClick={()=>setSelected(file.path)}>{file.path}</Button></td><td>{file.quadrant}</td><td>{file.commits}</td><td>{file.complexity}</td><td>{file.danger}</td></tr>)}</tbody></table></div>
  </Panel>;
}
export default visualizationsExtension;
