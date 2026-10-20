import { test, expect } from "bun:test";
import park from "./parkOnUsageLimit";
import setModel from "./setModel";

function fixture() {
    const rows = [
        { id: "a", model: "ssh/alpha:codex/main:gpt-test" },
        { id: "b", model: "ssh/alpha:codex/main:gpt-other" },
        { id: "c", model: "ssh/beta:codex/main:gpt-test" },
        { id: "d", model: "codex/main:gpt-test" },
        { id: "e", model: "ssh/alpha:claude-code/main:claude-test" },
    ];
    const ctx = { state: { agent: {} }, fns: {
        procs: { db: { select: async ({sql,params}: {sql: string; params?: unknown[]}) => sql.includes("WHERE id = ?") ? [{ ...rows.find(row => row.id === params?.[0]), run_state: "idle", scratchpad: JSON.stringify({ parked: { provider: "codex", account: "ssh.alpha.main" } }) }] : rows, run: async () => ({ changes: 1 }) } },
        llm: { recordUsage: async () => {}, resolveEndpoint: async () => ({ provider: "codex", account: "ssh.beta.main", kind: "subscription", ssh: { instance: "beta", provider: "codex", account: "main" } }) },
        session: { mutateScratchpad: async ({mutate}: { mutate: (value: object) => void }) => { const scratchpad = {}; mutate(scratchpad); return { scratchpad }; }, appendEvent: async () => {}, load: async () => null },
        events: { refreshAgentMeta: () => {}, emitAgentsChanged: () => {} },
        ui: { notify: async () => {} }, agent: { unpark: async () => {} },
    } } as unknown as Context;
    return ctx;
}

test("SSH quota parking matches only same instance/provider/account", async () => {
    const result = await park(fixture(), null, { info: { kind: "usage_limit", provider: "codex", account: "ssh.alpha.main", resetsAt: 999999, message: "limit", retryable: false } as types.llm.FailureInfo, now: 1 });
    expect(result.parked).toEqual(["a", "b"]);
});

test("SSH parked group switching preserves identity and allows keyless SSH endpoints", async () => {
    const result = await setModel(fixture(), null, { id: "a", model: "ssh/beta:codex/main:gpt-test", scope: "provider" });
    expect(result.changed).toEqual(["a", "b"]);
});
