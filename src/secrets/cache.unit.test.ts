import { expect, test } from "bun:test";
import get from "./get";
import set from "./set";

test("secret references ignore stale memory and observe each database snapshot", async () => {
    let stored: string | null = "committed-v1";
    const values = new Map([["test/key", "stale"]]);
    const ctx = { state: { secrets: { values } }, fns: { secrets: {
        parseRef: () => ({ namespace: "test", name: "key" }),
        getLocal: async () => stored,
    } } } as unknown as Context;
    expect(await get(ctx, null, { ref: "secret://test/key" })).toBe("committed-v1");
    stored = "committed-v2";
    expect(await get(ctx, null, { ref: "secret://test/key" })).toBe("committed-v2");
    stored = null;
    expect(await get(ctx, null, { ref: "secret://test/key" })).toBeNull();
    expect(values.get("test/key")).toBe("stale");
});

test("transaction-local secret writes and reads never publish plaintext to memory", async () => {
    let snapshot = "committed";
    const values = new Map<string, string>();
    const ctx = { state: { secrets: { values } }, fns: { secrets: {
        parseRef: () => ({ namespace: "test", name: "key" }),
        getLocal: async () => snapshot,
        putLocal: async ({ value }: { value: string }) => { snapshot = value; return { version: 2 }; },
    } } } as unknown as Context;
    expect(await set(ctx, null, { ref: "secret://test/key", value: "uncommitted" })).toEqual({ ref: "secret://test/key", version: 2 });
    expect(await get(ctx, null, { ref: "secret://test/key" })).toBe("uncommitted");
    snapshot = "committed"; // caller rolls back its transaction
    expect(await get(ctx, null, { ref: "secret://test/key" })).toBe("committed");
    expect(values.size).toBe(0);
});
