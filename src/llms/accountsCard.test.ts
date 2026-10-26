import quotaCards from "./quotaCards";
import { expect, test } from "bun:test";
import accountsCard from "./accountsCard";
import control from './modelControl';

const ctx: any = { state: { sshAccount: { flows: new Map() } }, fns: {
    procs: { ui: {
        escape: ({ text }: any) => String(text),
        row: (o: any) => JSON.stringify(o),
        heading: ({ title, meta }: any) => `${title} ${meta ?? ""}`,
        empty: () => "empty",
        button: (o: any) => JSON.stringify(o),
        toolbar: () => "toolbar",
    } },
    ui: {
        modelLogo: () => "logo",
        popup: (o: any) => JSON.stringify(o),
        live: ({ html }: any) => html,
    },
    llms: { quotaCards: (opts: Parameters<typeof quotaCards>[2]) => quotaCards(ctx, null, opts), modelControl: (opts: Parameters<typeof control>[2]) => control(ctx,null,opts) },
} };

test("accounts card groups consistently by provider and renders plan/storage metadata", () => {
    const html = accountsCard(ctx, null, { accounts: [
        { provider: "codex", account: "default", label: "codex", model: "codex:gpt", source: "file", available: true, usedPercent: 12, planType: "team", resetsAt: null, resetCredits: { availableCount: 3 }, parkedAgents: 0 },
        { provider: "anthropic-oauth", account: "pro", label: "pro", model: "anthropic-oauth/pro:claude", source: "oauth", available: true, usedPercent: 22, planType: "max", resetsAt: null, parkedAgents: 0 },
        { provider: "xai", account: "default", label: "Grok managed", model: "xai:grok", source: "oauth", available: true, usedPercent: null, planType: null, resetsAt: null, parkedAgents: 0 },
    ] });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="llm-provider-tab-codex" role="tab" aria-controls="llm-provider-panel-codex" aria-selected="true"');
    expect(html).toContain('id="llm-provider-panel-codex" data-provider="codex" role="tabpanel" aria-labelledby="llm-provider-tab-codex" tabindex="0" class=');
    expect(html).toContain('id="llm-provider-panel-claude" data-provider="claude" role="tabpanel" aria-labelledby="llm-provider-tab-claude" tabindex="0" hidden');
    expect(html).toContain('data-provider="codex"');
    expect(html).toContain('data-provider="claude"');
    expect(html).toContain('"role":"plan","text":"Team"');
    expect(html).toContain('data-provider="grok"');
    expect(html).toContain('"id":"xai/default"');
    expect(html).toContain('"role":"plan","text":"Max"');
    expect(html).toContain('"role":"storage","text":"CLI storage"');
    expect(html).toContain('"role":"storage","text":"Encrypted by Hyper"');
    expect(html).toContain("/llms/codex/reset");
    expect(html).toContain("3 resets");
    expect(html).toContain("Reset limit");
    expect(html).not.toContain("Accounts from filesystem");
    expect(html).not.toContain("Managed by Hyper");
});

test("shows a reconnect action only on the broken account", () => {
    const html = accountsCard(ctx, null, { accounts: [
        { provider: "codex", account: "persona", label: "persona", model: "codex/persona:gpt", source: "file", available: true, usedPercent: 10, planType: "team", resetsAt: null, parkedAgents: 1, needsReconnect: true },
        { provider: "codex", account: "healthy", label: "healthy", model: "codex/healthy:gpt", source: "file", available: true, usedPercent: 20, planType: "team", resetsAt: null, parkedAgents: 0, needsReconnect: false },
    ] });
    expect(html).toContain("authentication required");
    expect(html).toContain('llms.loginPopupFor');
    expect(html).toContain('\\"account\\":\\"persona\\"');
    expect(html).not.toContain('loginPopupFor\\",\\"params\\":{\\"provider\\":\\"codex\\",\\"account\\":\\"healthy\\"');
});

test("gateway health is API availability, never exhausted quota or verified generation", () => {
    for (const status of ["available", "unavailable", "unknown", "configured"] as const) {
        const html = accountsCard(ctx, null, { accounts: [{ provider: "oneapi", account: "default", label: "Asoft LLM Gate", model: "oneapi:", source: "file", available: status === "available", usedPercent: null, planType: null, resetsAt: null, parkedAgents: 0, gatewayHealth: { configured: true, status, reason: "models-ok", checkedAt: 1, models: [] } }] });
        expect(html).toContain("Asoft LLM Gate");
        expect(html).toContain('data-provider="oneapi"');
        expect(html).toContain("no quota data");
        expect(html).toContain("generation not verified");
        expect(html).not.toContain("limit exhausted");
        expect(html).not.toContain("llms.removeAccount");
    }
});

test("omits the other local connections section without changing the model catalogue", () => {
    const accounts: Parameters<typeof accountsCard>[2]["accounts"] = [
        { provider: "lmstudio", account: "default", label: "Local connection fixture", model: "lmstudio:local-test-model", source: "file", available: true, usedPercent: null, planType: null, resetsAt: null, parkedAgents: 0 },
    ];
    const models = { lmstudio: ["lmstudio:local-test-model"], openrouter: ["openrouter:catalogue-test-model"] };
    const html = accountsCard(ctx, null, { accounts, models });
    expect(html).not.toContain("Other local connections");
    expect(html).not.toContain("Local connection fixture");
    expect(html).toContain('data-provider="codex"');
    expect(html).toContain('data-catalogue="openrouter"');
    expect(html).toContain("openrouter:catalogue-test-model");
    expect(accounts).toHaveLength(1);
    expect(models.lmstudio).toEqual(["lmstudio:local-test-model"]);
});

test('OpenCode Console shows PAYG unavailable rather than subscription usage', () => {
 const html=accountsCard(ctx,null,{accounts:[{provider:'opencode',account:'default',label:'OpenCode Console',model:'opencode:',source:'file',available:true,usedPercent:null,planType:'Pay as you go',resetsAt:null,parkedAgents:0}],models:{opencode:['opencode:gpt']}});
 expect(html).toContain('data-provider="opencode"');
 expect(html).toContain('Pay as you go');
 expect(html).toContain('usage unavailable');
 expect(html).not.toContain('quota-5h');
});

test('Go connection names subscription, links Console Go and preserves SSH picker',()=>{
 const html=accountsCard(ctx,null,{accounts:[{provider:'opencode',account:'default',label:'OpenCode Go',model:'opencode:',source:'file',available:true,usedPercent:null,planType:'Go subscription',resetsAt:null,parkedAgents:0}],models:{opencode:['opencode:glm']}});
 for(const text of ['OpenCode Go','Go subscription','usage unavailable','Console Go','https://opencode.ai/console','/settings/declared']) expect(html).toContain(text);
 expect(html).not.toContain('Pay as you go');
 expect(html).not.toContain('Monthly member budget');
});

test('Go account displays measured 5h weekly and monthly subscription windows',()=>{
 const html=accountsCard(ctx,null,{accounts:[{provider:'opencode',account:'default',label:'OpenCode Go',model:'opencode:',source:'file',available:true,usedPercent:70,planType:'Go subscription',resetsAt:Date.now()+10000,parkedAgents:0,windows:{primary:{usedPercent:10,windowMinutes:300,resetsAt:Date.now()+10000},secondary:{usedPercent:30,windowMinutes:10080,resetsAt:Date.now()+20000},tertiary:{usedPercent:70,windowMinutes:43200,resetsAt:Date.now()+30000}}}],models:{opencode:['opencode:glm']}});
 for(const text of ['quota-5h','quota-weekly','quota-monthly','5h 10%','weekly 30%','monthly 70%'])expect(html).toContain(text);
 expect(html).not.toContain('quota unavailable');
});

test('Connections keeps disabled models visible with enable controls and exact account routes',()=>{
 const html=accountsCard(ctx,null,{accounts:[],models:{openai:['openai:a','openai/b:b']},disabledModels:['openai/default:a']});
 expect(html).toContain('data-model-policy="openai:a" data-model-disabled="true"');
 expect(html).toContain('data-model-policy="openai/b:b" data-model-disabled="false"');
 expect(html).toContain('Enable openai:a');expect(html).toContain('Disable openai/b:b');
 expect(html).toContain('/llms/model-state');
});

test('only OpenCode uses compact prices tables; all other providers retain original model cards',()=>{
 const html=accountsCard(ctx,null,{accounts:[],models:{opencode:['opencode:priced','opencode:unknown','opencode:included'],openai:['openai:ordinary'],codex:['codex:other'],lmstudio:['lmstudio:local']},prices:{'opencode:priced':{billing:'subscription',go:{requests5h:110,monthlyUsd:15},plus:{requests5h:440,monthlyUsd:60},source:'https://opencode.ai/go',updatedAt:1000},'opencode:included':{billing:'subscription',go:{requests5h:'unlimited',monthlyUsd:'unlimited'},plus:{requests5h:'unlimited',monthlyUsd:'unlimited'}}}});
 for(const value of ['<table','Est. requests / 5h','Monthly usage','Go Plus','110','440','$15','$60','∞','switchOnly','role="switch"','— unpublished','llm-go-bar','not PAYG prices'])expect(html).toContain(value);
 expect(html).not.toContain('USD / 1M');expect(html).not.toContain('Cache read');expect(html).not.toContain('models.dev');
 expect(html.match(/<table/g)).toHaveLength(1);
 expect(html).toContain('title="opencode:priced">priced</th>');
 expect(html).not.toContain('title="openai:ordinary">ordinary</th>');
 expect(html).toContain('llm-model-list');expect(html).toContain('title="openai:ordinary">ordinary</span>');
 expect(html).toContain('title="codex:other">other</span>');expect(html).not.toContain('disabled</span>');
});
test('non-OpenCode-only catalogues have no pricing tables',()=>{
 const html=accountsCard(ctx,null,{accounts:[],models:{openai:['openai:ordinary'],lmstudio:['lmstudio:local']}});
 expect(html).not.toContain('<table');expect(html).not.toContain('USD / 1M');expect(html).toContain('llm-model-list');
});

test('OpenCode table follows official rank rather than model discovery order; unknown models stay last',()=>{
 const html=accountsCard(ctx,null,{accounts:[],models:{opencode:['opencode:unknown','opencode:large','opencode:small']},prices:{'opencode:large':{billing:'subscription',order:2},'opencode:small':{billing:'subscription',order:0}}});
 expect(html.indexOf('title="opencode:small">')).toBeLessThan(html.indexOf('title="opencode:large">'));
 expect(html.indexOf('title="opencode:large">')).toBeLessThan(html.indexOf('title="opencode:unknown">'));
});

test('OpenCode bars match the official nonlinear scale and preserve each Go/Plus ratio',()=>{
 const prices = {
  'opencode:kimi-k3':{billing:'subscription' as const,go:{requests5h:110,monthlyUsd:15},plus:{requests5h:440,monthlyUsd:60}},
  'opencode:muse':{billing:'subscription' as const,go:{requests5h:45300,monthlyUsd:60},plus:{requests5h:90600,monthlyUsd:120}},
 };
 const html=accountsCard(ctx,null,{accounts:[],models:{opencode:['opencode:kimi-k3','opencode:muse']},prices});
 const widths=[...html.matchAll(/class="llm-go-bar llm-go-bar-(?:go|plus)" style="width:([\d.]+)%"/g)].map(m=>Number(m[1]));
 expect(widths).toHaveLength(4);
 expect(widths[0]).toBeCloseTo(1.6805449593076367,10);
 expect(widths[1]).toBeCloseTo(6.722179837230547,10);
 expect(widths[2]).toBeCloseTo(41,10);expect(widths[3]).toBeCloseTo(82,10);
 expect(widths[0]!/widths[1]!).toBeCloseTo(110/440,12);
 const filtered=accountsCard(ctx,null,{accounts:[],models:{opencode:['opencode:kimi-k3']},prices});
 expect(filtered).toContain(`width:${widths[0]}%`);expect(filtered).toContain(`width:${widths[1]}%`);
});

test('OpenCode unknown or zero bars are empty and unlimited bars are full',()=>{
 const html=accountsCard(ctx,null,{accounts:[],models:{opencode:['opencode:unknown','opencode:zero','opencode:free']},prices:{
  'opencode:zero':{billing:'subscription',go:{requests5h:0,monthlyUsd:0},plus:{requests5h:0,monthlyUsd:0}},
  'opencode:free':{billing:'subscription',go:{requests5h:'unlimited',monthlyUsd:'unlimited'},plus:{requests5h:'unlimited',monthlyUsd:'unlimited'}},
 }});
 const widths=[...html.matchAll(/class="llm-go-bar llm-go-bar-(?:go|plus)" style="width:([\d.]+)%"/g)].map(m=>Number(m[1]));
 expect(widths).toEqual([0,0,0,0,100,100]);
 expect(html).not.toContain('width:NaN');expect(html).not.toContain('width:Infinity');
});

test("SSH accounts show their account name and a remove action like local named accounts", () => {
    const html = accountsCard(ctx, null, { accounts: [
        { provider: "codex", account: "ssh.box.work", label: "box · codex · work", model: "ssh/box:codex/work:", source: "ssh", available: true, usedPercent: 10, planType: "pro", resetsAt: null, parkedAgents: 0, sshInstance: "box" },
        { provider: "kimi-coding", account: "ssh.box.kimi", label: "box · kimi-coding · kimi", model: "ssh/box:kimi-coding/kimi:", source: "ssh", available: true, usedPercent: 30, planType: "Pro", resetsAt: null, parkedAgents: 0, sshInstance: "box" },
    ] });
    expect(html).toContain('"role":"account","text":"work"');
    expect(html).toContain('"role":"account","text":"kimi"');
    expect(html).toContain("llms.removeAccount");
    expect(html).toContain('\\"account\\":\\"ssh.box.work\\"');
    expect(html).toContain('\\"account\\":\\"ssh.box.kimi\\"');
});

test("default local CLI accounts stay non-removable", () => {
    const html = accountsCard(ctx, null, { accounts: [
        { provider: "codex", account: "default", label: "default", model: "codex:gpt", source: "file", available: true, usedPercent: 10, planType: "pro", resetsAt: null, parkedAgents: 0 },
    ] });
    expect(html).not.toContain("llms.removeAccount");
});

test('Kimi connection shows monthly and only explicitly reported rolling windows',()=>{
 for(const includeShort of [true,false]){
  const html=accountsCard(ctx,null,{accounts:[{provider:'kimi-coding',account:'default',label:'Kimi',model:'kimi-coding:',source:'file',available:true,usedPercent:50,planType:'Pro',resetsAt:null,parkedAgents:0,windows:{tertiary:{usedPercent:50,windowMinutes:43200,resetsAt:Date.now()+86400000},...(includeShort?{primary:{usedPercent:20,windowMinutes:300,resetsAt:Date.now()+3600000}}:{})}}]});
  expect(html).toContain('quota-monthly');expect(html).not.toContain('quota-weekly');
  expect(html.includes('quota-5h')).toBe(includeShort);
 }
});
