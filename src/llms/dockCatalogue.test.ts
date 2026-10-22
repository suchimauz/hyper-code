import { expect, test } from "bun:test";
import card from "./accountsCard";
import dial from "../ui/usageDial";
import route from "./$route_usage_GET";
import usageData from "./usageData";
import logo from '../ui/modelLogo';

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
test('subscription rings keep quota in a minimal hover card without the model list',()=>{
 const html=dial(ctx,null,{entries:[{provider:'codex',account:'alice',label:'mini · alice',node:'mini',models:['hyper/mini:gpt'],usedPercent:17,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral'}]});expect(html).toContain('17% used');expect(html).toContain('stroke-dasharray');expect(html).toContain('quota-tip');expect(html).toContain('Hyper node mini');expect(html).not.toContain('hyper/mini:gpt');expect(html).not.toContain('account alice');
});
test('Z.ai has a branded connection section and an unknown-quota dock icon', async () => {
 const a:any={provider:'zai-coding',account:'default',label:'Z.ai Coding Plan',model:'zai-coding:',source:'file',available:true,usedPercent:null,planType:'Coding Plan',resetsAt:null,parkedAgents:0};
 const c:any={state:{llmUsageRefresh:{startedAt:Date.now()}},fns:{...ctx.fns,settings:{get:async()=>'secret://test/zai'},ui:{...ctx.fns.ui,modelLogo:(o:any)=>logo(c,null,o)},llm:{usageOverview:async()=>[],listAccounts:async()=>[a],listModels:async()=>({'zai-coding':['zai-coding:glm-5.3']})},node:{list:async()=>[]}}};
 const html=card(c,null,{accounts:[a],models:{'zai-coding':['zai-coding:glm-5.3']}});
 expect(html).toContain('data-provider="zai-coding"');expect(html).toContain('Z.ai Coding Plan');expect(html).not.toContain('ph-cpu');
 const data=await usageData(c,null,{});expect(data.entries[0]).toMatchObject({provider:'zai-coding',usedPercent:null,quotaStatus:'unavailable'});
 const dock=dial(c,null,{entries:data.entries});expect(dock).toContain('quota unavailable');expect(dock).toContain('quota-tip');expect(dock).not.toContain('Available models');expect(dock).not.toContain('stroke-dasharray');expect(dock).not.toContain('ph-cpu');
});

test('MiniMax M Plan has a branded connection section and an unknown-quota dock icon', async () => {
 const a:any={provider:'minimax-coding',account:'default',label:'MiniMax M Plan',model:'minimax-coding:',source:'file',available:true,usedPercent:null,planType:'M Plan',resetsAt:null,parkedAgents:0};
 const c:any={state:{llmUsageRefresh:{startedAt:Date.now()}},fns:{...ctx.fns,settings:{get:async(opts:any)=>opts.key==='minimaxCodingApiKey'?'secret://test/minimax':null},ui:{...ctx.fns.ui,modelLogo:(o:any)=>logo(c,null,o)},llm:{usageOverview:async()=>[],listAccounts:async()=>[a],listModels:async()=>({'minimax-coding':['minimax-coding:MiniMax-M3']})},node:{list:async()=>[]}}};
 const html=card(c,null,{accounts:[a],models:{'minimax-coding':['minimax-coding:MiniMax-M3']}});
 expect(html).toContain('data-provider="minimax-coding"');expect(html).toContain('MiniMax M Plan');expect(html).not.toContain('ph-cpu');
 const data=await usageData(c,null,{});expect(data.entries[0]).toMatchObject({provider:'minimax-coding',usedPercent:null,quotaStatus:'unavailable'});
 const dock=dial(c,null,{entries:data.entries});expect(dock).toContain('quota unavailable');expect(dock).toContain('quota-tip');expect(dock).not.toContain('Available models');expect(dock).not.toContain('stroke-dasharray');expect(dock).not.toContain('ph-cpu');
});
