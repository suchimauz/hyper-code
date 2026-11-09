import { test, expect } from "bun:test";
import listAccounts from "./listAccounts";
import usageOverview from "./usageOverview";
import normalizeQuotaWindows from "./normalizeQuotaWindows";
import usageData from "../llms/usageData";
import accountsRoute from "../llms/$route_accounts_GET";

test("SSH inventory uses recorded normal-provider synthetic quota identities without credentials", async () => {
    const ctx = { env: { HOME: "" }, fns: { llm: {
        usageOverview: async () => [{ provider: "codex", account: "ssh.alpha.main", usedPercent: 80, planType: "pro", resetsAt: 99 }],
        accountAuthHealth: async () => [{ provider: "codex", account: "ssh.alpha.blocked", needsReconnect: true }], accountCredentialExists: () => false,
    }, sshInstance: { list: async () => [{ name: "alpha" }, { name: "beta" }] }, sshAccount: { registry: async () => { throw new Error("Owner-only registry must not be read"); }, quotaAccounts: async () => [
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
    const ctx = { fns: { llm: { normalizeQuotaWindows: (opts: Parameters<typeof normalizeQuotaWindows>[2]) => normalizeQuotaWindows({} as Context, null, opts) }, settings: { getNumber: async () => 75 }, procs: { db: { select: async () => [{ value: JSON.stringify({ provider: "codex", account: "ssh.alpha.main", windows: { primary: { usedPercent: 42 } } }) }] } } } } as unknown as Context;
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

test("retired account fragment redirects SSH management to native connections without actions", () => {
    const response = accountsRoute({} as Context, null, {});
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/?settings=llm-connections");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.body).toBeNull();
});
