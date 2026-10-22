import { expect, test } from "bun:test";
import usageData from "./usageData";

function setup() {
    let refreshes = 0;
    const ctx: any = { state: {}, fns: {
        llm: {
            refreshUsage: () => { refreshes++; return new Promise(() => {}); },
            usageOverview: async (opts: {}) => {
                expect(opts).toEqual({ connectedOnly: true });
                return [{ provider: "codex", account: "default", label: "codex", model: "codex:", usedPercent: null, resetsAt: null, planType: null, resetCredits: { secret: "not exported" }, parkedAgents: 0, tone: "neutral", updatedAt: 1 }];
            },
            listModels: async () => ({ codex: ["codex:a", "codex/team:b"], "hyper/remote": ["hyper/remote:a"] }),
            gatewayHealth: async () => ({ status: "available", reason: "models-ok", models: ["oneapi:a"], apiKey: "never-export" }),
        },
        node: { list: async () => [{ name: "remote", enabled: true, catalogAt: 1, usageAt: 1, catalog: [{ id: "a", provider: "codex", account: "default" }], usage: [{ provider: "codex", account: "default", usedPercent: 90 }] }] },
    } };
    return { ctx, refreshes: () => refreshes };
}

test("nonblocking shared refresh, local unknown, remote stale and narrow gateway data", async () => {
    const { ctx, refreshes } = setup();
    const first = await usageData(ctx, null, {});
    await usageData(ctx, null, {});
    expect(refreshes()).toBe(1);
    expect(first.entries[0]).toMatchObject({ models: ["codex:a"], usedPercent: null, tone: "neutral" });
    expect(first.entries[0].quotaStatus).toBeUndefined();
    expect(first.entries[1]).toMatchObject({ models: ["hyper/remote:a"], quotaStatus: "stale", usedPercent: 90, tone: "error", node: "remote" });
    expect(first.gateway).toEqual({ status: "available", reason: "models-ok", models: ["oneapi:a"] });
    expect(JSON.stringify(first)).not.toContain("secret");
    expect(JSON.stringify(first)).not.toContain("never-export");
});

test("missing or nonfinite remote quota stays unavailable; gateway is optional", async () => {
    const { ctx } = setup();
    ctx.fns.llm.gatewayHealth = undefined;
    for (const value of [undefined, NaN, Infinity]) {
        ctx.fns.node.list = async () => [{ name: "remote", enabled: true, catalogAt: 1, usageAt: Date.now(), catalog: [{ id: "a", provider: "codex", account: "default" }], usage: [{ provider: "codex", account: "default", usedPercent: value }] }];
        const data = await usageData(ctx, null, {});
        expect(data.entries[1]).toMatchObject({ usedPercent: null, quotaStatus: "unavailable" });
        expect(data.gateway).toBeNull();
    }
});

test("node-list failure preserves local entries", async () => {
    const { ctx } = setup();
    ctx.fns.node.list = async () => { throw new Error("offline"); };
    expect((await usageData(ctx, null, {})).entries).toHaveLength(1);
});

function inventory(provider: string, account = "default") {
    return { provider, account, label: `${provider}/${account}`, model: `${provider}${account === "default" ? "" : `/${account}`}:`, available: true, needsReconnect: false, planType: null, parkedAgents: 0, usedPercent: 0, resetsAt: null, resetCredits: { secret: "inventory-secret" } };
}

test("connected inventory adds unknown quota, preserves explicit auth state and excludes remote/gateway inventory", async () => {
    const { ctx } = setup();
    ctx.fns.llm.listAccounts = async () => [inventory("codex"), { ...inventory("xai"), available: false, needsReconnect: true }, inventory("hyper"), inventory("oneapi")];
    const data = await usageData(ctx, null, { includeConnected: true });
    expect(data.entries.find(e => e.provider === "xai")).toMatchObject({ usedPercent: null, updatedAt: 0, tone: "neutral", quotaStatus: "unavailable", available: false, needsReconnect: true });
    expect(data.entries.find(e => e.provider === "codex" && !e.node)).toMatchObject({ updatedAt: 1, available: true, needsReconnect: false });
    expect(data.entries.filter(e => e.node)).toHaveLength(1);
    expect(data.entries.some(e => e.provider === "oneapi" || e.provider === "hyper")).toBe(false);
    expect(JSON.stringify(data)).not.toContain("inventory-secret");
});

test("inventory removes disconnected supported providers but retains unknown-provider snapshots", async () => {
    const { ctx } = setup();
    const original = (await ctx.fns.llm.usageOverview({ connectedOnly: true }))[0];
    ctx.fns.llm.usageOverview = async () => ["codex", "kimi-coding", "claude-code", "anthropic-oauth", "xai", "custom"].map(provider => ({ ...original, provider }));
    ctx.fns.llm.listAccounts = async () => [];
    expect((await usageData(ctx, null, { includeConnected: true })).entries.filter(e => !e.node).map(e => e.provider)).toEqual(["custom"]);
    expect((await usageData(ctx, null, { includeConnected: false })).entries.filter(e => !e.node)).toHaveLength(6);
});

test("named inventory maps provider defaults only when no explicit account routes exist", async () => {
    const { ctx } = setup();
    ctx.fns.llm.listAccounts = async () => [inventory("codex", "team"), inventory("codex", "work"), inventory("xai", "other")];
    ctx.fns.llm.listModels = async () => ({ codex: ["codex:a", "codex/team:b", "codex:a"], xai: ["xai:c"], unrelated: ["other:z"] });
    const data = await usageData(ctx, null, { includeConnected: true });
    expect(data.entries.find(e => e.account === "team")?.models).toEqual(["codex/team:b"]);
    expect(data.entries.find(e => e.account === "work")?.models).toEqual(["codex/work:a"]);
    expect(data.entries.find(e => e.account === "other")?.models).toEqual(["xai/other:c"]);
});

test("default desktop mode never reads inventory or rewrites named routes", async () => {
    const { ctx } = setup();
    ctx.fns.llm.listAccounts = async () => { throw new Error("must not read inventory"); };
    const snapshot = (await ctx.fns.llm.usageOverview({ connectedOnly: true }))[0];
    ctx.fns.llm.usageOverview = async () => [{ ...snapshot, account: "work" }];
    for (const opts of [{}, { includeConnected: false }]) {
        const data = await usageData(ctx, null, opts);
        expect(data.entries[0]).toMatchObject({ models: [], updatedAt: 1 });
        expect(data.entries[0].available).toBeUndefined();
        expect(data.entries[0].needsReconnect).toBeUndefined();
    }
});

test("coding-plan labels show the chosen egress instance", async () => {
    const ctx: any = { state: {}, fns: {
        llm: {
            refreshUsage: () => new Promise(() => {}),
            usageOverview: async () => [
                { provider: "zai-coding", account: "default", label: "Z.ai", model: "zai-coding:", usedPercent: 10, resetsAt: null, planType: "Coding Plan", resetCredits: null, parkedAgents: 0, tone: "neutral", updatedAt: Date.now() },
                { provider: "minimax-coding", account: "default", label: "MiniMax", model: "minimax-coding:", usedPercent: null, resetsAt: null, planType: "M Plan", resetCredits: null, parkedAgents: 0, tone: "neutral", updatedAt: Date.now() },
            ],
            listModels: async () => ({}),
            listAccounts: async () => [],
            codingInstance: async (opts: any) => ({ instance: opts.provider === "zai-coding" ? "box" : null }),
        },
        node: { list: async () => [] },
    } };
    const data = await usageData(ctx, null, {});
    const zai = data.entries.find((e: any) => e.provider === "zai-coding");
    expect(zai!.label).toBe("Z.ai · box");
    const mm = data.entries.find((e: any) => e.provider === "minimax-coding");
    expect(mm!.label).toBe("MiniMax");
    expect(mm!.quotaStatus).toBe("unavailable");
});

// A plan on a chosen SSH instance is remote traffic: it must be filed under
// that instance, never under Local, while its model route stays <provider>:.
test("a plan with a chosen SSH instance reports that identity and keeps its model route", async () => {
    const ctx: any = { state: {}, fns: {
        llm: {
            refreshUsage: () => new Promise(() => {}),
            usageOverview: async () => [
                { provider: "minimax-coding", account: "default", label: "MiniMax", model: "minimax-coding:", usedPercent: 12, resetsAt: null, planType: "M Plan", resetCredits: null, parkedAgents: 0, tone: "neutral", updatedAt: Date.now() },
                { provider: "zai-coding", account: "default", label: "Z.ai", model: "zai-coding:", usedPercent: 10, resetsAt: null, planType: "Coding Plan", resetCredits: null, parkedAgents: 0, tone: "neutral", updatedAt: Date.now() },
            ],
            listModels: async () => ({ "minimax-coding": ["minimax-coding:MiniMax-M3.1-Flash"], "zai-coding": ["zai-coding:glm-4.6"] }),
            listAccounts: async () => [],
            codingInstance: async (opts: any) => ({ instance: opts.provider === "minimax-coding" ? "edge" : null }),
        },
        node: { list: async () => [] },
    } };
    const { entries } = await usageData(ctx, null, {});
    const mm = entries.find((e: any) => e.provider === "minimax-coding")!;
    expect(mm.account).toBe("ssh.edge.default");
    expect(mm.label).toBe("MiniMax · edge");
    expect(mm.model).toBe("minimax-coding:");
    expect(mm.models).toEqual(["minimax-coding:MiniMax-M3.1-Flash"]);
    expect(entries.find((e: any) => e.provider === "zai-coding")!.account).toBe("default");
});

test('OpenCode Console desktop and mobile stay PAYG unavailable', async () => {
 const {ctx} = setup();
 let configured = true;
 const account = {provider:'opencode',account:'default',label:'OpenCode Console',model:'opencode:',planType:'Pay as you go',parkedAgents:0,available:true,needsReconnect:false};
 ctx.fns.settings = {get: async ({key}: {key:string}) => configured && key === 'opencodeApiKey' ? 'secret://test/opencode' : null};
 ctx.fns.llm.listAccounts = async () => configured ? [account] : [];
 ctx.fns.llm.listModels = async () => ({opencode:['opencode:gpt']});
 ctx.fns.llm.codingInstance = async () => ({instance:'edge'});
 ctx.fns.llm.usageOverview = async () => [{...account,usedPercent:99,windows:{primary:{usedPercent:99}},updatedAt:Date.now(),tone:'error'}];
 for (const includeConnected of [false,true]) {
  const {entries} = await usageData(ctx,null,{includeConnected});
  const rows = entries.filter((e:any)=>e.provider==='opencode');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({label:'OpenCode Console · edge',usedPercent:null,resetsAt:null,quotaStatus:'unavailable',tone:'neutral',planType:'Pay as you go',models:['opencode:gpt']});
  expect(rows[0]!.windows).toBeUndefined();
 }
 configured=false;
 for (const includeConnected of [false,true]) expect((await usageData(ctx,null,{includeConnected})).entries.some((e:any)=>e.provider==='opencode')).toBe(false);
});

test('OpenCode budget is cached, safe and never mapped to quota percent', async () => {
 const {ctx}=setup();
 const account={provider:'opencode',account:'default',label:'OpenCode',model:'opencode:',planType:'Pay as you go',parkedAgents:0,available:true};
 ctx.fns.settings={get:async ({key}:any)=>key==='opencodeApiKey'?'secret://test/opencode':null};
 ctx.fns.llm.usageOverview=async()=>[];
 ctx.fns.llm.listAccounts=async()=>[account];
 let calls=0;
 ctx.fns.llm.opencodeUsage=async()=>{calls++;return {available:true,spentUsd:1.25,limitUsd:10,resetsAt:Date.now()+1000,email:'private@example.com',user_id:'private-id'};};
 await usageData(ctx,null,{});
 await Promise.resolve();
 const data=await usageData(ctx,null,{includeConnected:true});
 const entry=data.entries.find((e:any)=>e.provider==='opencode')!;
 expect(calls).toBe(1);
 expect(entry.memberBudgetText).toBe('Monthly member budget $1.25 / $10.00');
 expect(entry.memberBudget).toMatchObject({available:true,spentUsd:1.25,limitUsd:10});
 expect(entry.usedPercent).toBeNull();
 expect(JSON.stringify(data)).not.toContain('private');
 ctx.state.opencodeBudgetUi.value={available:true,spentUsd:1.25,limitUsd:null};
 expect((await usageData(ctx,null,{})).entries.find((e:any)=>e.provider==='opencode')!.memberBudgetText).toContain('unlimited');
});
