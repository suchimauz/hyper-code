import { expect, test } from "bun:test";
import status from "./accountLoginStatus";
import cancel from "../sshAccount/cancel";

function fixture() {
    const killed: string[] = [], failed: object[] = [], refreshed: string[] = [];
    const flow = { id: "flow", provider: "kimi-coding", account: "work", instance: null, status: "pending", userCode: "ABCD", verificationUri: "https://auth.kimi.com", deviceCode: "secret", process: { kill: () => killed.push("flow") } };
    const ctx: any = { state: { sshAccount: { flows: new Map([["flow", flow], ["remote", { ...flow, instance: "remote" }], ["done", { ...flow, status: "connected" }]]) } }, fns: {
        sshAccount: { requireOwner: async () => {}, registry: async (opts: object) => failed.push(opts) },
        procs: { events: { refresh: ({topic}: any) => refreshed.push(topic) } },
    } };
    return {ctx, flow, killed, failed, refreshed};
}

test("local Kimi pending login exposes reopenable hints and cancel id without secrets", () => {
    const {ctx} = fixture();
    const rows = status(ctx, null, {});
    expect(rows).toEqual([{id:"flow", provider:"kimi-coding", account:"work", status:"pending", verificationUri:"https://auth.kimi.com", userCode:"ABCD", needsCode:false, error:null}]);
    expect(JSON.stringify(rows)).not.toContain("secret");
    expect(rows[0]).not.toHaveProperty("process");
});

test("Kimi cancellation stops only the pending flow and is idempotent", async () => {
    const {ctx, flow, killed, failed, refreshed} = fixture();
    await cancel(ctx, null, {id: status(ctx, null, {})[0].id!});
    expect(flow.status).toBe("cancelled");
    expect(killed).toEqual(["flow"]);
    expect(failed).toEqual([{action:"fail", instance:null, provider:"kimi-coding", account:"work"}]);
    expect(refreshed).toEqual(["ssh-accounts"]);
    await cancel(ctx, null, {id:"flow"});
    expect(killed).toHaveLength(1);
});

test("Kimi cancellation checks ownership before touching the flow", async () => {
    const {ctx, flow, killed, failed} = fixture();
    ctx.fns.sshAccount.requireOwner = async () => { throw new Error("owner required"); };
    await expect(cancel(ctx, null, {id:"flow"})).rejects.toThrow("owner required");
    expect(flow.status).toBe("pending");
    expect(killed).toEqual([]);
    expect(failed).toEqual([]);
});
