import { expect, test } from "bun:test";
import usageOverview from "./usageOverview";
import listModels from "./listModels";
import listAccounts from "./listAccounts";
import accountCredentialExists from "./accountCredentialExists";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("live usage hides logged-out Codex, preserves history and remote accounts", async () => {
    let connected = false;
    const rows = [
        { provider: "codex", account: "default" },
        { provider: "codex", account: "work" },
        { provider: "hyper", account: "mini6/codex/one" },
        { provider: "hyper", account: "mini6/codex/two" },
    ].map(snapshot => ({ value: JSON.stringify({ ...snapshot, windows: { primary: { usedPercent: 80 } } }) }));
    const ctx = { fns: {
        settings: { getNumber: async ({ fallback }: any) => fallback },
        procs: { db: { select: async () => rows } },
        llm: { accountCredentialExists: ({ account }: any) => account === "work" || connected },
    } } as unknown as Context;
    expect((await usageOverview(ctx, null, { connectedOnly: true })).map(x => x.account)).toEqual(["work", "mini6/codex/one", "mini6/codex/two"]);
    expect(await usageOverview(ctx, null, {})).toHaveLength(4);
    connected = true;
    expect(await usageOverview(ctx, null, { connectedOnly: true })).toHaveLength(4);
    expect(rows).toHaveLength(4);
});

test("cached catalogue prunes only removed local Codex credential, preserving mini6 slots", async () => {
    const remote = ["hyper/mini6:codex/one:gpt-test", "hyper/mini6:codex/two:gpt-test"];
    const ctx = { state: { llmModelCatalog: { all: { at: Date.now(), value: {
        codex: ["codex:gpt-test", "codex/work:gpt-test"], "hyper/mini6": remote,
    } } } }, fns: { llm: { accountCredentialExists: ({ account }: any) => account === "work" } } } as unknown as Context;
    const result = await listModels(ctx, null, {});
    expect(result.codex).toEqual(["codex/work:gpt-test"]);
    expect(result["hyper/mini6"]).toEqual(remote);
});

test("absent CLI file is not a connected account; existing auth and node survive", async () => {
    const home = mkdtempSync(join(tmpdir(), "hyper-logout-test-"));
    const path = join(home, ".codex/auth.json");
    const ctx = { env: { HOME: home }, fns: {
        llm: {
            usageOverview: async () => [{ provider: "codex", account: "default", usedPercent: 90 }],
            accountAuthHealth: async () => [],
            accountCredentialPath: ({ provider }: any) => ({ file: provider === "codex" ? path : join(home, "absent") }),
        },
        procs: { db: { select: async () => [] } },
        node: { list: async () => [{ name: "mini6", enabled: true, catalog: [{ account: "one" }, { account: "two" }] }] },
    } } as unknown as Context;
    (ctx.fns.llm as any).accountCredentialExists = (opts: any) => accountCredentialExists(ctx, null, opts);
    try {
        expect(accountCredentialExists(ctx, null, { provider: "codex" })).toBe(false);
        expect((await listAccounts(ctx, null, {})).map(x => x.account)).toEqual(["mini6"]);
        mkdirSync(join(home, ".codex"));
        writeFileSync(path, JSON.stringify({ tokens: { access_token: "synthetic-test", refresh_token: "synthetic-test" } }));
        expect(accountCredentialExists(ctx, null, { provider: "codex" })).toBe(true);
        expect((await listAccounts(ctx, null, {})).map(x => x.account)).toEqual(["default", "mini6"]);
    } finally { rmSync(home, { recursive: true, force: true }); }
});
