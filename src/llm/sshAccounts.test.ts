import { test, expect } from "bun:test";
import listAccounts from "./listAccounts";
import usageOverview from "./usageOverview";
import usageData from "../llms/usageData";
import accountsCard from "../llms/accountsCard";

test("SSH inventory uses recorded normal-provider synthetic quota identities without credentials", async () => {
    const ctx = { env: { HOME: "" }, fns: { llm: {
        usageOverview: async () => [{ provider: "codex", account: "ssh.alpha.main", usedPercent: 80, planType: "pro", resetsAt: 99 }],
        accountAuthHealth: async () => [{ provider: "codex", account: "ssh.alpha.blocked", needsReconnect: true }], accountCredentialExists: () => false,
    }, sshInstance: { list: async () => [{ name: "alpha" }, { name: "beta" }] }, sshAccount: { registry: async () => [
        { instance: "alpha", provider: "codex", account: "main", status: "connected" },
        { instance: "beta", provider: "codex", account: "main", status: "pending" },
        { instance: "alpha", provider: "codex", account: "blocked", status: "connected" },
        { instance: "deleted", provider: "codex", account: "main", status: "connected" },
    ] } } } as unknown as Context;
    const rows = await listAccounts(ctx, null, { provider: "codex" });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ source: "ssh", account: "ssh.alpha.main", model: "ssh/alpha:codex/main:", usedPercent: 80, available: true, planType: "pro" });
    expect(rows[2]).toMatchObject({ account: "ssh.alpha.blocked", available: false, needsReconnect: true });
    expect(rows[1]).toMatchObject({ account: "ssh.beta.main", available: false, needsReconnect: true, usedPercent: null });
});

test("connected-only quota retains SSH Codex snapshots without local auth files", async () => {
    const ctx = { fns: { settings: { getNumber: async () => 75 }, procs: { db: { select: async () => [{ value: JSON.stringify({ provider: "codex", account: "ssh.alpha.main", windows: { primary: { usedPercent: 42 } } }) }] } } } } as unknown as Context;
    expect(await usageOverview(ctx, null, { connectedOnly: true })).toHaveLength(1);
});

test("quota UI maps synthetic SSH identities back to full remote routes, never local aliases", async () => {
    const route = "ssh/alpha.dev:codex/main:gpt-test";
    const ctx = { state: { llmUsageRefresh: { promise: null, startedAt: Date.now() } }, fns: {
        llm: { usageOverview: async () => [{ provider: "codex", account: "ssh.alpha.dev.main", model: "codex/ssh.alpha.dev.main:", usedPercent: 32 }], listModels: async () => ({ codex: ["codex:gpt-test"], "ssh/alpha.dev": [route] }) },
        node: { list: async () => [] },
    } } as unknown as Context;
    const result = await usageData(ctx, null, {});
    expect(result.entries[0]?.models).toEqual([route]);
    expect(result.entries[0]?.model).toBe("ssh/alpha.dev:codex/main:");
});

test("account UI includes SSH rows without local reconnect/unlink actions", () => {
    const ctx = { state: {}, fns: { ui: { modelLogo: () => "", popup: (opts: object) => JSON.stringify(opts), live: ({html}: {html: string}) => html }, procs: { ui: { row: (opts: object) => JSON.stringify(opts), escape: ({text}: {text: string}) => Bun.escapeHTML(text), button: () => "", input: () => "", heading: () => "", empty: () => "" } } } } as unknown as Context;
    const html = accountsCard(ctx, null, { accounts: [{ provider: "codex", account: "ssh.alpha.main", label: "REMOTE-SENTINEL", model: "ssh/alpha:codex/main:", source: "ssh", available: false, usedPercent: null, planType: null, resetsAt: null, parkedAgents: 0, needsReconnect: true }], models: { "ssh/alpha": ["ssh/alpha:codex/main:gpt-test"] } });
    expect(html).toContain("SSH · alpha");
    expect(html).toContain("ssh/alpha:codex/main:gpt-test");
    expect(html).toContain('\\"instance\\":\\"alpha\\"');
    expect(html).not.toContain("llms.removeAccount");
    expect(html).not.toContain("/llms/codex/reset");
});
