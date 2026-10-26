import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import card from './accountsCard';
import quotaCards from './quotaCards';
import modelControl from './modelControl';
import route from './$route__GET';

const escape = ({text}: {text:string}) => Bun.escapeHTML(String(text ?? ''));
const accounts = ['codex','opencode'].map(provider => ({provider,account:'default',label:provider,model:`${provider}:model`,source:'file' as const,available:true,usedPercent:25,planType:provider==='opencode'?'Go subscription':'plus',resetsAt:null,parkedAgents:0}));
const models = {codex:['codex:model'],opencode:['opencode:model'],xai:['xai:grok-catalogue-only']};
const ctx: any = {state:{},fns:{
 procs:{ui:{escape,row:()=>'',heading:({title}:any)=>`<h2>${escape({text:title})}</h2>`,empty:()=>'<p>Empty</p>',button:()=>'<button>Action</button>'}},
 ui:{modelLogo:()=>'',popup:()=>'<button>Action</button>',live:({id,url,html}:any)=>`<div id="${id}" data-url="${url}">${html}</div>`},
 llms:{},llm:{listAccounts:async()=>accounts,refreshUsage:async()=>{},accountLoginStatus:()=>[],modelPolicy:async()=>({disabledModels:[]}),listModels:async()=>models,modelPrices:async()=>({}),codingInstance:async()=>({instance:null})},
 node:{list:async()=>[],card:async()=>'<div id="hyper-nodes">Node management</div>'},sshInstance:{list:async()=>[]},
 settings:{status:async()=>({anthropicOAuth:{connected:false},codex:{loggedIn:true},kimiCoding:{loggedIn:false},openai:{set:true},anthropic:{set:false},openrouter:{set:false}}),getString:async()=>null,getNumber:async()=>16384}
}};
ctx.fns.llms.quotaCards=(opts:any)=>quotaCards(ctx,null,opts);
ctx.fns.llms.modelControl=(opts:any)=>modelControl(ctx,null,opts);
ctx.fns.llms.accountsCard=(opts:any)=>card(ctx,null,opts);
ctx.fns.llms.planInstanceSettings=()=>'';
const script = await Bun.file(new URL('./$script_focus.js',import.meta.url)).text();
const html = async () => (await route(ctx,null,{req:new Request('http://example.test/llms'),params:{}})).main;
const wait = () => new Promise(resolve => setTimeout(resolve,0));

test('focus surface keeps real model forms and separates API and node management',async()=>{
 const output=await html();const w=new Window();
 try{w.document.body.innerHTML=output;
  expect(output).toContain('Модели и лимиты');
  expect(w.document.querySelectorAll('[data-llm-provider]').length).toBe(7);
  expect(w.document.querySelectorAll('.llm-provider-panel:not([hidden])').length).toBe(1);
  expect(w.document.querySelector('.llm-model-table')).not.toBeNull();
  expect(w.document.querySelector('[data-model-policy="opencode:model"] input[name=model]')?.getAttribute('value')).toBe('opencode:model');
  expect(w.document.querySelector('[data-model-policy="opencode:model"]')?.getAttribute('hx-post')).toBe('/llms/model-state');
  expect(w.document.querySelector('#hyper-nodes')?.closest('[data-llm-section]')?.getAttribute('data-llm-section')).toBe('nodes');
  expect(w.document.querySelectorAll('[data-llm-section="api"][hidden]').length).toBe(2);
 }finally{await w.happyDOM.close();}
});

test('provider selection, search, filter and section survive live account morphs',async()=>{
 const w=new Window({url:'http://example.test'});
 try{w.document.body.innerHTML=await html();w.eval('Element.prototype.scrollIntoView=function(){}');w.eval(script);
  const query=(s:string)=>w.document.querySelector(s)!;
  (query('[data-llm-provider=opencode]') as any).click();
  expect(query('[data-provider=opencode]').hasAttribute('hidden')).toBe(false);
  expect(query('[data-provider=codex]').hasAttribute('hidden')).toBe(true);
  (query('[data-llm-tab=api]') as any).click();
  expect(query('#llm-section-content').getAttribute('aria-labelledby')).toBe('llm-section-api');
  query('#llm-accounts').outerHTML=card(ctx,null,{accounts,models});await wait();
  expect(query('[data-llm-tab=api]').getAttribute('aria-selected')).toBe('true');
  expect(query('[data-llm-section=api]').hasAttribute('hidden')).toBe(false);
  (query('[data-llm-tab=subscriptions]') as any).click();
  expect(query('[data-llm-provider=opencode]').getAttribute('aria-selected')).toBe('true');
  const input=query('#llm-provider-search') as any;input.value='no match';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  expect(w.document.querySelectorAll('.llm-provider-panel:not([hidden])').length).toBe(0);
  expect(query('.llm-provider-empty').hasAttribute('hidden')).toBe(false);
  input.value='';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  (query('.llm-connected-filter') as any).click();
  expect(w.document.querySelectorAll('[data-llm-provider]:not([hidden])').length).toBe(2);
  query('#llm-accounts').outerHTML=card(ctx,null,{accounts,models});await wait();
  expect(query('.llm-connected-filter').getAttribute('aria-pressed')).toBe('true');
  expect(w.document.querySelectorAll('[data-llm-provider]:not([hidden])').length).toBe(2);
  // Re-execution during a live swap must not attach another click listener.
  w.eval(script);(query('.llm-connected-filter') as any).click();
  expect(query('.llm-connected-filter').getAttribute('aria-pressed')).toBe('false');
 }finally{await w.happyDOM.close();}
});

test('tabs support keyboard navigation and safe fallback when a selected provider disappears',async()=>{
 const w=new Window();
 try{w.document.body.innerHTML=await html();w.eval('Element.prototype.scrollIntoView=function(){}');w.eval(script);
  const first=w.document.querySelector('[data-llm-provider=codex]')!;
  first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  expect(w.document.activeElement?.getAttribute('data-llm-provider')).toBe('minimax-coding');
  const selected=w.document.activeElement!;selected.remove();await wait();
  expect(w.document.querySelector('[data-llm-provider=codex]')?.getAttribute('aria-selected')).toBe('true');
  expect(w.document.querySelectorAll('.llm-provider-panel:not([hidden])').length).toBe(1);
  const section=w.document.querySelector('[data-llm-tab=subscriptions]')!;
  section.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  expect(w.document.activeElement?.getAttribute('data-llm-tab')).toBe('api');
 }finally{await w.happyDOM.close();}
});

test('mobile selection scrolls only the rail and preserves it through mutations and live replacement', async () => {
 const w=new Window();
 try {
  w.document.body.innerHTML=await html();
  const nav=w.document.querySelector('.llm-provider-nav')! as any;
  nav.style.flexDirection='row';
  nav.getBoundingClientRect=()=>({left:16,right:374});
  const grok=w.document.querySelector('[data-llm-provider=grok]')! as any;
  grok.getBoundingClientRect=()=>({left:274,right:421});
  let outerScrolls=0;grok.scrollIntoView=()=>{outerScrolls++;};
  w.eval(script);grok.click();await wait();
  expect(nav.scrollLeft).toBe(47);
  expect(outerScrolls).toBe(0);
  expect(grok.getAttribute('aria-selected')).toBe('true');
  expect(w.document.querySelector('[data-provider=grok]')?.hasAttribute('hidden')).toBe(false);
  expect(w.document.querySelector('[data-catalogue=grok] [data-model-policy]')?.closest('.llm-provider-detail')).not.toBeNull();
  nav.scrollLeft=110;nav.dispatchEvent(new w.Event('scroll'));await wait();
  expect(nav.scrollLeft).toBe(110);
  w.document.querySelector('#llm-accounts')!.outerHTML=card(ctx,null,{accounts,models});await wait();
  expect((w.document.querySelector('.llm-provider-nav')! as any).scrollLeft).toBe(110);
  expect(w.document.querySelector('[data-llm-provider=grok]')?.getAttribute('aria-selected')).toBe('true');
 } finally {await w.happyDOM.close();}
});
