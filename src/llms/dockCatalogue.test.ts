import { expect, test } from "bun:test";
import card from "./accountsCard";
import dial from "../ui/usageDial";
import route from "./$route_usage_GET";
import usageData from "./usageData";

const escape = ({text}: {text: string}) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const ctx: any = {state: {llmUsageRefresh:{startedAt:Date.now()}}, fns:{procs:{ui:{escape, heading:({title}:any)=>title, empty:()=>'', button:()=>'', row:()=>''}},ui:{live:({html}:any)=>html, modelLogo:()=>'<i></i>', popup:()=>''}}};
const account:any={provider:'oneapi',account:'default',label:'Asoft LLM Gate',model:'oneapi:',source:'file',available:true,usedPercent:null,planType:null,resetsAt:null,parkedAgents:0,gatewayHealth:{status:'available',reason:'models-ok',models:['gpt-test'],checkedAt:1}};
test('connections render gateway, account-grouped node and catalogue-only local models, never hidden models',()=>{
 const html=card(ctx,null,{accounts:[account],models:{'hyper/mini':['hyper/mini:good'],'lmstudio':['lmstudio:local']},nodes:[{name:'mini',enabled:true,catalogAt:Date.now(),catalog:[{id:'good',provider:'codex',account:'alice'},{id:'hidden',provider:'codex',account:'bob'}]} as any]});
 expect(html).toContain('oneapi:gpt-test');expect(html).toContain('data-node-account="codex/alice"');expect(html).toContain('hyper/mini:good');expect(html).toContain('lmstudio:local');expect(html).not.toContain('hyper/mini:hidden');expect(html).toContain('generation not verified');
});
test('gateway dock is a neutral circle, status dot and escaped model tooltip without text block',async()=>{
 ctx.fns.llm={usageOverview:async()=>[],listModels:async()=>({}),gatewayHealth:async()=>({...account.gatewayHealth,models:['gpt<test>']})};ctx.fns.node={list:async()=>[]};ctx.fns.ui.usageDial=(o:any)=>dial(ctx,null,o);
 ctx.fns.llms={usageData:(opts:any)=>usageData(ctx,null,opts)};
 const html=await(await route(ctx,null,{})).text();
 expect(html).toContain('data-gateway="oneapi"');expect(html).toContain('size-7');expect(html).toContain('bg-success');expect(html).toContain('gpt&lt;test&gt;');expect(html).not.toContain('stroke-dasharray');expect(html).not.toContain('>Asoft LLM Gate');expect(html).toContain('generation not verified');
});
test('subscription rings preserve quota and add account/model tooltip',()=>{
 const html=dial(ctx,null,{entries:[{provider:'codex',account:'alice',label:'mini · alice',node:'mini',models:['hyper/mini:gpt'],usedPercent:17,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral'}]});expect(html).toContain('17% used');expect(html).toContain('stroke-dasharray');expect(html).toContain('hyper/mini:gpt');expect(html).toContain('account alice');
});
