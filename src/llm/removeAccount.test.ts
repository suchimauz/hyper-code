import { describe, expect, test } from "bun:test";
import removeAccount from "./removeAccount";

const model = "codex/pro500:gpt-5";
type Row = { id: string; model: string | null; archived_at: number | null; run_state: string };
const row = (extra: Partial<Row> = {}): Row => ({ id: "cached", model, archived_at: 1, run_state: "idle", ...extra });

// Stop at the first credential operation: tests never delete files or secrets.
function fixture(rows: Row[], live: Record<string, object>) {
    let credentialReached = false;
    const ctx = { state: { agent: live }, fns: {
        procs: { db: { select: async () => rows } },
        llm: { accountCredentialPath: () => { credentialReached = true; throw new Error("credential boundary"); } },
    } } as unknown as Context;
    return { ctx, reached: () => credentialReached };
}
async function check(rows: Row[], live: Record<string, object>, blocked: boolean) {
    const f = fixture(rows, live);
    await expect(removeAccount(f.ctx, null, { provider: "codex", account: "pro500" }))
        .rejects.toThrow(blocked ? "account is used by agent(s): cached" : "credential boundary");
    expect(f.reached()).toBe(!blocked);
}

describe("removeAccount credential-use guard", () => {
    test("idle archived cached agents do not block or change historical models", async () => {
        const rows = [row()];
        const live = { cached: { model, isStreaming: false, abortController: null } };
        const before = JSON.stringify({ rows, live });
        await check(rows, live, false);
        expect(JSON.stringify({ rows, live })).toBe(before);
    });
    test("unarchived persisted selection blocks without a cached object", () =>
        check([row({ archived_at: null })], {}, true));
    test("unarchived cached selection blocks even if persisted model differs", () =>
        check([row({ archived_at: null, model: "codex/other:gpt-5" })], { cached: { model } }, true));
    test("archived persisted running selection blocks without memory", () =>
        check([row({ run_state: "running" })], {}, true));
    for (const [label, state] of Object.entries({
        streaming: { isStreaming: true },
        directRun: { activeRunCount: 1, abortController: new AbortController() },
        sampling: { samplingAbortController: new AbortController() },
        job: { currentJobId: "run-token" },
        draining: { drainPromise: Promise.resolve() },
        aborted: { activeRunCount: 1, abortController: (() => { const c = new AbortController(); c.abort(); return c; })() },
    })) {
        test(`archived stale DB cannot hide in-flight ${label}`, () =>
            check([row({ model: "codex/other:gpt-5" })], { cached: { model, ...state } }, true));
    }
    test("idle archived legacy controller is not evidence of an unsettled run", () =>
        check([row()], { cached: { model, abortController: new AbortController() } }, false));
    test("missing DB row with in-flight memory fails closed", () =>
        check([], { cached: { model, abortController: new AbortController() } }, true));
    test("missing DB row with idle memory fails closed (not proven archived)", () =>
        check([], { cached: { model } }, true));
    test("unrelated credential does not block", () =>
        check([row({ archived_at: null, model: "codex/other:gpt-5" })], { cached: { model: "codex/other:gpt-5", isStreaming: true } }, false));
    test("no DB or memory references allows reaching credential boundary", () => check([], {}, false));
});
