import { useEffect, useRef, useState } from 'react';
import { Button, Panel, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

type Choices = { models: {name:string}[]; agents: {id:string;title:string}[] };
type Decision = {kind:string;command:string|null;opts:Record<string,unknown>;reason:string;confident:boolean;preview?:unknown};
type Block = {id:number;final:string;partial:string};
const SR = 16000;
/** Encode the mono PCM frames without retaining microphone resources. */
export function whisperWav(chunks: Float32Array[], length: number): ArrayBuffer {
  const b = new ArrayBuffer(44 + length * 2), v = new DataView(b);
  const word = (o:number,s:string) => { for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  word(0,'RIFF'); v.setUint32(4,36+length*2,true); word(8,'WAVE'); word(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,SR,true); v.setUint32(28,SR*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); word(36,'data'); v.setUint32(40,length*2,true);
  let o=44; for(const c of chunks) for(const sample of c) { const s=Math.max(-1,Math.min(1,sample)); v.setInt16(o,s<0?s*32768:s*32767,true); o+=2; } return b;
}
const junk = (t:string) => !t || /^[\s.,!?…-]*$/.test(t) || /^\[.*\]$|^\(.*\)$|^\*.*\*$/.test(t) || /Продолжение следует|Субтитры|Thank you for watching|аплодисмент|applause/i.test(t);
export function WhisperPage({context}:ExtensionViewProps) {
  const [choices,setChoices]=useState<Choices>({models:[],agents:[]});
  const [model,setModel]=useState('large-v3-turbo'), [language,setLanguage]=useState('ru'), [prompt,setPrompt]=useState('hyper, agent, procs.db.select, git commit, steer, delegate, Claude, Postgres');
  const [focus,setFocus]=useState(context.agentId ?? ''), [typed,setTyped]=useState(''), [threshold,setThreshold]=useState(0.35);
  const [status,setStatus]=useState('Off'), [active,setActive]=useState(false), [level,setLevel]=useState(0);
  const [blocks,setBlocks]=useState<Block[]>([{id:1,final:'',partial:''}]), [logs,setLogs]=useState<string[]>([]);
  const [pending,setPending]=useState(false);
  const mounted=useRef(true), epoch=useRef(0), current=useRef(1), sequence=useRef(1), stopRef=useRef<()=>void>(()=>{}), pendingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const requests=useRef(new Set<AbortController>());
  const settings=useRef({model,language,prompt,focus,threshold,readOnly:context.readOnly}); settings.current={model,language,prompt,focus,threshold,readOnly:context.readOnly};
  const log=(s:string)=> { if(mounted.current) setLogs(p=>[s,...p].slice(0,100)); };
  const cancel=()=>{ if(pendingTimer.current) clearTimeout(pendingTimer.current); pendingTimer.current=null; if(mounted.current) setPending(false); };
  const patch=(id:number,update:(b:Block)=>Block)=>{ if(mounted.current) setBlocks(bs=>bs.map(b=>b.id===id?update(b):b)); };
  const newBlock=()=>{current.current=++sequence.current;setBlocks(bs=>[{id:current.current,final:'',partial:''},...bs]);};
  useEffect(()=>{ mounted.current=true; const controller=new AbortController(); requestJson<Choices>('/whisper?format=json',{signal:controller.signal}).then(data=>{setChoices(data); if(!data.models.some(m=>m.name==='large-v3-turbo')) setModel(data.models[0]?.name ?? '');}).catch(e=>{if(!controller.signal.aborted)setStatus(String(e));}); return ()=>{mounted.current=false;epoch.current++;controller.abort();stopRef.current();cancel();for(const r of requests.current)r.abort();}; },[]);
  useEffect(()=>{if(context.readOnly){stopRef.current();cancel();}},[context.readOnly]);
  async function route(text:string,partial:boolean, token=epoch.current) {
    if(settings.current.readOnly) return null;
    const controller=new AbortController(); requests.current.add(controller);
    try {
      const d=await requestJson<Decision>('/whisper/dispatch',{method:'POST',body:{text,partial,focusAgentId:settings.current.focus},signal:controller.signal});
      if(!mounted.current || token!==epoch.current) return null;
      if(partial && !d.confident) return d;
      if(d.kind==='cancel') cancel();
      if(d.command==='ui.openAgent' && typeof d.opts.agentId==='string') setFocus(d.opts.agentId);
      log(`${partial?'Partial':'Final'}: ${text}\n${d.command ?? 'Dictation'} · ${d.reason}\n${JSON.stringify(d.opts)}${d.preview?'\n'+JSON.stringify(d.preview):''}`);
      if(d.kind==='dictation' && d.command) { cancel(); setPending(true); pendingTimer.current=setTimeout(()=>{pendingTimer.current=null;if(mounted.current){setPending(false);log('Dry run complete — nothing was sent.');}},2500); }
      return d;
    } finally {requests.current.delete(controller);}
  }
  async function start() {
    if(active || settings.current.readOnly) return;
    const token=++epoch.current; setActive(true);setStatus('Requesting microphone…');
    let stream:MediaStream|null=null, ac:AudioContext|null=null, node:ScriptProcessorNode|null=null, source:MediaStreamAudioSourceNode|null=null;
    let chunks:Float32Array[]=[], length=0, speech=false, silence=0, speechMs=0, generation=0, inflight=false, last=0, stopped=false;
    const reset=()=>{chunks=[];length=0;speech=false;silence=0;speechMs=0;generation++;};
    const valid=()=>mounted.current && epoch.current===token && !stopped;
    const cleanup=()=>{ stopped=true;generation++; if(node){node.onaudioprocess=null;node.disconnect();}source?.disconnect();stream?.getTracks().forEach(t=>t.stop());if(ac)void ac.close().catch(e=>{if(mounted.current)setStatus(String(e));}); if(mounted.current){setActive(false);setLevel(0);} };
    stopRef.current=()=>{epoch.current++;cleanup();cancel();for(const r of requests.current)r.abort();if(mounted.current){setStatus('Off');setBlocks(bs=>bs.map(b=>({...b,partial:''})));}};
    async function ask(frames:Float32Array[],n:number) {
      const csrf=document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if(!csrf) throw new Error('CSRF token required. Reload the page.');
      const controller=new AbortController(); requests.current.add(controller);
      try {const s=settings.current;const q=new URLSearchParams({model:s.model,language:s.language,prompt:s.prompt});
        const response=await fetch('/whisper/live?'+q,{method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',headers:{'Content-Type':'audio/wav','X-CSRF-Token':csrf},body:whisperWav(frames,n),signal:controller.signal});
        const j=await response.json() as {text?:string;error?:string};if(!response.ok||j.error)throw new Error(j.error ?? `Transcription failed (${response.status})`);return j.text ?? '';
      }finally{requests.current.delete(controller);}
    }
    async function finalize() {
      const frames=chunks,n=length,id=current.current;reset(); const gen=generation;
      if(n<SR*.3){patch(id,b=>({...b,partial:''}));return;}
      try {const text=await ask(frames,n);if(!valid())return;if(!junk(text)){patch(id,b=>({...b,final:[b.final,text].filter(Boolean).join(' ')}));await route(text,false,token);}}
      catch(e){if(valid())setStatus(String(e));}finally{if(valid()&&(gen===generation||id!==current.current))patch(id,b=>({...b,partial:''}));}
    }
    async function partial() {
      if(inflight||!length)return;inflight=true;const gen=generation,id=current.current;
      try{const text=await ask(chunks.slice(),length);if(!valid()||gen!==generation)return;patch(id,b=>({...b,partial:junk(text)?'':text}));if(!junk(text)&&text.length<80){const d=await route(text,true,token);if(valid()&&gen===generation&&d?.confident){reset();patch(id,b=>({...b,partial:''}));}}}
      catch(e){if(valid())setStatus(String(e));}finally{inflight=false;}
    }
    let env=.01,envPeak=.02,cooldown=0;
    let clap:{after:number;peak:number;tail:number;count:number;background:number;frames:Float32Array[];length:number}|null=null;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
      if(!valid()){stream.getTracks().forEach(t=>t.stop());return;}
      ac=new AudioContext({sampleRate:SR});await ac.resume();if(!valid()){cleanup();return;}
      source=ac.createMediaStreamSource(stream);node=ac.createScriptProcessor(2048,1,1);
      node.onaudioprocess=e=>{if(!valid())return;const x=e.inputBuffer.getChannelData(0);
        for(let o=0;o<x.length;o+=256){let peak=0,sum=0;for(let i=o;i<Math.min(o+256,x.length);i++){peak=Math.max(peak,Math.abs(x[i]));sum+=x[i]*x[i];}const rms=Math.sqrt(sum/256);
          if(cooldown>0){cooldown-=256;continue;}
          if(clap){clap.after+=256;if(clap.after<=SR*.03)clap.peak=Math.max(clap.peak,rms);else if(clap.after<SR*.16){clap.tail+=rms;clap.count++;}else{const c=clap;clap=null;if(Math.max(0,c.tail/c.count-c.background)/Math.max(1e-6,c.peak-c.background)<.4){cancel();chunks=c.frames;length=c.length;if(speech)void finalize();else reset();newBlock();cooldown=SR*.8;setStatus('Clap — new block');return;}}}
          else if(peak>settings.current.threshold&&peak>envPeak*5)clap={after:0,peak:rms,tail:0,count:0,background:env,frames:chunks.slice(),length};
          if(!clap){env=env*.95+rms*.05;envPeak=envPeak*.9+peak*.1;}
        }
        const rms=Math.sqrt(x.reduce((s,a)=>s+a*a,0)/x.length),ms=x.length/SR*1000;setLevel(Math.min(1,rms*8));
        if(rms>.012){speech=true;silence=0;speechMs+=ms;}else silence+=ms;
        if(!speech){chunks=[new Float32Array(x)];length=x.length;return;}chunks.push(new Float32Array(x));length+=x.length;
        if(clap)return;if((silence>700&&speechMs>200)||length>SR*25){void finalize();return;}if(performance.now()-last>600){last=performance.now();void partial();}
      };
      source.connect(node);node.connect(ac.destination);setStatus('Listening — pause to finalize');
    }catch(e){cleanup();if(mounted.current&&epoch.current===token)setStatus(`Microphone: ${String(e)}`);}
  }
  return <div className="mx-auto max-w-4xl space-y-5 p-6"><header><h1 className="text-2xl font-semibold">Whisper live</h1><p className="text-subtle">Local speech recognition. Start explicitly enables the microphone. Pause to finalize; clap to start a new block.</p></header>
    <Panel title="Microphone"><div className="grid gap-3 sm:grid-cols-3"><label>Model<select className="block w-full rounded border border-line bg-transparent p-2" value={model} disabled={active} onChange={e=>setModel(e.target.value)}>{choices.models.map(m=><option key={m.name}>{m.name}</option>)}</select></label><label>Language<select className="block w-full rounded border border-line bg-transparent p-2" value={language} onChange={e=>setLanguage(e.target.value)}>{['auto','ru','en','pt'].map(l=><option key={l}>{l}</option>)}</select></label><label>Vocabulary prompt<input className="block w-full rounded border border-line bg-transparent p-2" value={prompt} onChange={e=>setPrompt(e.target.value)}/></label></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={!active&&(context.readOnly||!model)} onClick={()=>active?stopRef.current():void start()}>{active?'Stop':'Start microphone'}</Button><Button onClick={()=>{current.current=++sequence.current;setBlocks([{id:current.current,final:'',partial:''}]);}}>Clear transcript</Button><meter aria-label="Microphone level" min={0} max={1} value={level}/><label>Clap sensitivity <input type="range" min="0.1" max="0.8" step="0.01" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label></div><p role="status" className="mt-3 text-subtle">{status}</p></Panel>
    <section aria-label="Transcript" className="space-y-3">{blocks.map(b=><Panel key={b.id} title={`Block ${b.id}`}><p className="text-xs text-subtle">Block {b.id}</p><p className="whitespace-pre-wrap text-lg">{b.final} <span className="text-subtle">{b.partial}</span></p></Panel>)}</section>
    <Panel title="Command preview"><h2 className="font-semibold">Agent command preview — dry run only</h2><p className="text-sm text-subtle">Switch, stop, create, unread, cancel and dictation are classified, never executed or sent.</p><label>Focused agent<select className="m-2 rounded border border-line bg-transparent p-2" value={focus} onChange={e=>setFocus(e.target.value)}><option value="">No agent</option>{choices.agents.map(a=><option key={a.id} value={a.id}>{a.title} · {a.id}</option>)}</select></label>
    <form onSubmit={e=>{e.preventDefault();const text=typed.trim();if(text&&!context.readOnly){setTyped('');void route(text,false).catch(e=>setStatus(String(e)));}}}><label>Test a phrase without microphone<input className="my-2 block w-full rounded border border-line bg-transparent p-2" value={typed} onChange={e=>setTyped(e.target.value)}/></label><Button type="submit" disabled={context.readOnly||!typed.trim()}>Preview phrase</Button></form>
    {pending&&<p role="status">Pending dry run — say cancel, clap, or <Button onClick={cancel}>Cancel</Button></p>}<div aria-label="Command previews" className="mt-3 max-h-80 space-y-2 overflow-auto">{logs.map((l,i)=><pre className="whitespace-pre-wrap rounded border border-line p-2 text-xs" key={i}>{l}</pre>)}</div></Panel></div>;
}
const whisperExtension:UiExtension={id:'whisper',apiVersion:1,pages:[{id:'overview',title:'Whisper live',component:WhisperPage}],navigation:[{page:'overview',title:'Whisper live'}]};
export default whisperExtension;
