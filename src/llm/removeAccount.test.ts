import { describe, expect, test } from "bun:test";
import removeAccount from "./removeAccount";

// Stop at the first credential operation: tests never delete files or secrets.
function fixture(users: Array<{ id: string }>, archiveErrors: Record<string, string> = {}) {
    const calls: any[] = [];
    const ctx = { state: { agent: {} }, fns: {
        procs: {
            db: { run: async (o: any) => { calls.push(["kv", o.params?.[0]]); } },
            events: { refresh: () => {} },
        },
        session: { archive: async ({ id }: any) => { if (archiveErrors[id]) throw new Error(archiveErrors[id]); calls.push(["archive", id]); return { ok: true }; } },
        llm: {
            accountUsers: async () => users,
            accountCredentialPath: () => { calls.push(["credential"]); throw new Error("credential boundary"); },
        },
    } } as unknown as Context;
    return { ctx, calls };
}

describe("removeAccount credential-use guard", () => {
    test("users block removal unless archiveUsers is set", async () => {
        const f = fixture([{ id: "cached" }]);
        await expect(removeAccount(f.ctx, null, { provider: "codex", account: "pro500" }))
            .rejects.toThrow("account is used by agent(s): cached — switch their model first");
        expect(f.calls).toHaveLength(0);
    });
    test("no users reaches the credential boundary", async () => {
        const f = fixture([]);
        await expect(removeAccount(f.ctx, null, { provider: "codex", account: "pro500" }))
            .rejects.toThrow("credential boundary");
        expect(f.calls[0]).toEqual(["credential"]);
    });
    test("archiveUsers archives every user before touching the credential", async () => {
        const f = fixture([{ id: "a1" }, { id: "a2" }]);
        await expect(removeAccount(f.ctx, null, { provider: "codex", account: "pro500", archiveUsers: true }))
            .rejects.toThrow("credential boundary");
        expect(f.calls).toEqual([["archive", "a1"], ["archive", "a2"], ["credential"]]);
    });
    test("a busy agent that cannot be archived aborts before any credential work", async () => {
        const f = fixture([{ id: "busy" }], { busy: "This chat is running" });
        await expect(removeAccount(f.ctx, null, { provider: "codex", account: "pro500", archiveUsers: true }))
            .rejects.toThrow("cannot archive agent(s): busy (This chat is running) — stop their work first");
        expect(f.calls.filter(([kind]) => kind !== "archive")).toHaveLength(0); // no kv/credential calls
    });
});

describe("removeAccount SSH registry accounts", () => {
    function sshFixture(users: Array<{ id: string }>) {
        const calls: any[] = [];
        const ctx = { state: { agent: {} }, fns: {
            procs: {
                db: { run: async (o: any) => { calls.push(["kv", o.params?.[0]]); } },
                events: { refresh: () => {} },
            },
            session: { archive: async ({ id }: any) => { calls.push(["archive", id]); return { ok: true }; } },
            llm: { accountUsers: async () => users },
            sshAccount: { registry: async (o: any) => { calls.push(["registry", o]); return []; } },
        } } as unknown as Context;
        return { ctx, calls };
    }
    test("removes only the registry row and the usage cache, never a local credential", async () => {
        const { ctx, calls } = sshFixture([]);
        const result = await removeAccount(ctx, null, { provider: "kimi-coding", account: "ssh.box.work" });
        expect(result).toEqual({ removed: true, provider: "kimi-coding", account: "ssh.box.work", archived: [] });
        expect(calls[0]).toEqual(["registry", { action: "remove", instance: "box", provider: "kimi-coding", account: "work" }]);
        expect(calls[1]).toEqual(["kv", "llm:usage:kimi-coding:ssh.box.work"]);
    });
    test("archives route users first, then removes the registry row", async () => {
        const { ctx, calls } = sshFixture([{ id: "remote-user" }]);
        const result = await removeAccount(ctx, null, { provider: "kimi-coding", account: "ssh.box.work", archiveUsers: true });
        expect(result.archived).toEqual(["remote-user"]);
        expect(calls[0]).toEqual(["archive", "remote-user"]);
        expect(calls[1]).toEqual(["registry", { action: "remove", instance: "box", provider: "kimi-coding", account: "work" }]);
    });
    test("an in-use registry account blocks without archiveUsers", async () => {
        const { ctx, calls } = sshFixture([{ id: "remote-user" }]);
        await expect(removeAccount(ctx, null, { provider: "kimi-coding", account: "ssh.box.work" }))
            .rejects.toThrow("account is used by agent(s): remote-user");
        expect(calls).toHaveLength(0);
    });
});
