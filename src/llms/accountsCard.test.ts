import { expect, test } from "bun:test";
import accountsCard from "./accountsCard";

const ctx: any = { fns: {
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
} };

test("accounts card groups consistently by provider and renders plan/storage metadata", () => {
    const html = accountsCard(ctx, null, { accounts: [
        { provider: "codex", account: "default", label: "codex", model: "codex:gpt", source: "file", available: true, usedPercent: 12, planType: "team", resetsAt: null, resetCredits: { availableCount: 3 }, parkedAgents: 0 },
        { provider: "anthropic-oauth", account: "pro", label: "pro", model: "anthropic-oauth/pro:claude", source: "oauth", available: true, usedPercent: 22, planType: "max", resetsAt: null, parkedAgents: 0 },
        { provider: "xai", account: "default", label: "Grok managed", model: "xai:grok", source: "oauth", available: true, usedPercent: null, planType: null, resetsAt: null, parkedAgents: 0 },
    ] });
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
    expect(html).toContain("llms.loginPopupFor");
    expect(html).toContain('\\"account\\":\\"persona\\"');
    expect(html).not.toContain('llms.loginPopupFor\\",\\"params\\":{\\"provider\\":\\"codex\\",\\"account\\":\\"healthy\\"');
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
