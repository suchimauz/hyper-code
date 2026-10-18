import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import layout from '../ui/layout';
const ctx = {state:{},fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text)),button:()=>''}},ui:{faviconUrl:async()=>'',navMenu:()=>''},dock:{render:async()=>''}}} as unknown as Context;
const main='<div class="llm-connections"><header class="llm-connections-header"><div><div><h1>LLM Connections</h1></div></div></header><div class="llm-connections-content"><div class="llm-accounts"><div data-entity="llm-account"><span data-role="prefix">codex/long-account-name:</span><span data-role="quota">75% left</span><span class="llm-account-actions"><button>Remove</button></span></div><section data-node="remote"><div class="llm-node-account"><div class="llm-node-quota" data-quota-state="fresh">13% left</div><ul class="llm-model-list"><li>hyper/remote:codex/name:model</li></ul></div></section><div data-entity="hyper-node"><span data-role="url">https://remote.example</span><span data-role="accounts">2 accounts</span><span><button>Edit</button></span></div><div data-entity="hyper-node-client"><span data-role="providers">codex,anthropic</span><button>Revoke</button></div><form class="llm-account-form"><input name="account"></form></div></div></div>';
test('Connections stacks real account/node fields and gives all mobile actions 44px targets',async()=>{
 const html=await layout(ctx,null,{main});const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 for(const [width,touch,mobile]of [[320,5,true],[390,5,true],[844,5,true],[844,0,false],[1280,0,false]]as const){
  const w=new Window({width,height:844});Object.defineProperty(w.navigator,'maxTouchPoints',{value:touch});
  try{w.document.body.innerHTML=main;const style=w.document.createElement('style');style.textContent=css.replace(/@media\s*([^{}]+)\{/g,(_m,q:string)=>`@media ${q.split(',').some(part=>w.matchMedia(part.trim()).matches)?'(min-width:0px)':'(min-width:99999px)'} {`);w.document.head.append(style);
   const computed=(s:string)=>w.getComputedStyle(w.document.querySelector(s)!);
   if(mobile){
    expect(computed('[data-entity="llm-account"]').flexWrap).toBe('wrap');expect(computed('[data-entity="hyper-node"]').flexWrap).toBe('wrap');expect(computed('[data-entity="hyper-node-client"]').flexWrap).toBe('wrap');
    expect(computed('[data-role="quota"]').flexBasis).toBe('100%');expect(computed('[data-role="url"]').whiteSpace).toBe('normal');expect(computed('.llm-model-list').flexDirection).toBe('column');expect(computed('button').minHeight).toBe('44px');expect(computed('input').minHeight).toBe('44px');expect(computed('.llm-node-quota').fontSize).toBe('14px');
   }else{expect(computed('[data-entity="llm-account"]').flexWrap).not.toBe('wrap');expect(computed('.llm-model-list').flexDirection).not.toBe('column');}
  }finally{await w.happyDOM.close();}
 }
});
