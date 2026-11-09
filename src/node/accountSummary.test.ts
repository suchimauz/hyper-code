import { expect, test } from "bun:test";
import accountSummary from "./accountSummary";

const model = (provider: string, account: string, suffix = "a") => ({ id: `${provider}/${account}:${suffix}`, provider, account, api: "responses" as const, kind: "subscription" as const });
const base = (): types.node.NodeEntry => ({ name: "test", url: "https://node.test", enabled: true, catalog: [model("codex", "same"), model("codex", "same", "b"), model("claude-code", "same")], catalogAt: 1, usage: null, usageAt: null, lastError: null });
const summarize = (node = base(), visibleModelIds?: string[]) => accountSummary({} as Context, null, { node, visibleModelIds });

test("counts distinct provider/account pairs, not model rows or account names alone", async () => {
    expect(await summarize()).toMatchObject({ count: 2, total: 2, status: "catalog" });
});
test("visible catalogue intersection accepts qualified IDs and empty selection", async () => {
    expect((await summarize(base(), ["hyper/test:codex/same:a"])).count).toBe(1);
    expect((await summarize(base(), ["codex/same:b"])).count).toBe(1);
    expect((await summarize(base(), [])).count).toBe(0);
    expect((await summarize(base(), ["hyper/other:codex/same:a"])).count).toBe(0);
});
test("disabled or forbidden nodes never claim active accounts even with a cached catalogue", async () => {
    expect(await summarize({ ...base(), enabled: false })).toMatchObject({ count: 0, total: 2, status: "disabled", accounts: [] });
    expect(await summarize({ ...base(), lastError: "models 403: forbidden" })).toMatchObject({ count: 0, status: "error", accounts: [] });
    expect(await summarize({ ...base(), lastError: "connection refused" })).toMatchObject({count:2,status:'cached'});
});
test("unknown, stale, exhausted and non-catalogue quota snapshots cannot change catalogue counts", async () => {
    const node = base();
    node.usageAt = 1;
    node.usage = [{ provider: "codex", account: "same", usedPercent: 100, resetsAt: 1, planType: null, parkedAgents: 0 }, { provider: "secret", account: "not-shared", usedPercent: 0, resetsAt: null, planType: null, parkedAgents: 0 }];
    expect((await summarize(node)).count).toBe(2);
    node.usage[0].usedPercent = null;
    expect((await summarize(node)).count).toBe(2);
    expect((await summarize()).count).toBe(2);
});
test("absent and empty catalogues have no accounts", async () => {
    expect((await summarize({...base(),catalogAt:null})).count).toBe(0);
    for (const catalog of [null, []]) expect(await summarize({ ...base(), catalog })).toMatchObject({ count: 0, total: 0, status: "empty" });
});
