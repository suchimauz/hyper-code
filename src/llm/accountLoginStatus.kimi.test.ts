import { expect, test } from "bun:test";
import status from "./accountLoginStatus";
import popup from "../llms/loginPopup";
import progress from "../llms/loginProgressFor";

test("local Kimi pending login is visible and reopenable with cancellation", () => {
    const flow = { id: "flow", provider: "kimi-coding", account: "work", instance: null, status: "pending", userCode: "ABCD", verificationUri: "https://auth.kimi.com", deviceCode: "secret" };
    const ctx: any = { state: { sshAccount: { flows: new Map([["local", flow], ["remote", { ...flow, instance: "remote" }], ["done", { ...flow, status: "connected" }]]) } }, fns: {} };
    const rows = status(ctx, null, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("deviceCode");
    ctx.fns = { procs: { ui: { escape: ({text}: any) => Bun.escapeHTML(text), field: () => "", button: ({label}: any) => `<button>${label}</button>` } }, ui: { popupContent: ({title,html}: any) => title + html }, llm: { accountLoginStatus: () => rows }, llms: { loginPopup: (opts: any) => popup(ctx,null,opts) } };
    const html = progress(ctx,null,{ provider: "kimi-coding", account: "work" });
    expect(html).toContain("Kimi Coding login");
    expect(html).toContain("Open authorization page");
    expect(html).toContain("Cancel authorization");
    expect(html).toContain("sshAccount.cancelFromPopup");
    expect(html).not.toContain("secret");
});
