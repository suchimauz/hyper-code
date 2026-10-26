import quotaCards from "./quotaCards";
import modelControl from "./modelControl";
import { describe, expect, test } from "bun:test";
import accountsCard from "./accountsCard";

/** The account rows the card renders, with a quota to colour. */
const account = (used: number | null, thresholds?: { warnAt: number; criticalAt: number; alertAt: number }) => ({
    provider: "codex", account: "work", label: "Codex", model: "codex:", source: "file" as const,
    available: true, usedPercent: used, planType: "Team", resetsAt: null, parkedAgents: 0, thresholds,
});

const ctx: any = { fns: {
    procs: { ui: {
        escape: ({ text }: any) => String(text),
        row: (o: any) => `<span class="${(o.cells ?? []).map((c: any) => c.class ?? "").join(" ")}">${(o.cells ?? []).map((c: any) => c.text ?? "").join("|")}</span>`,
        heading: ({ title }: any) => title,
        empty: () => "empty",
        button: () => "",
        toolbar: () => "",
    } },
    ui: { modelLogo: () => "logo", popup: () => "", live: ({ html }: any) => html },
} };

ctx.fns.llms = { quotaCards: (o: Parameters<typeof quotaCards>[2]) => quotaCards(ctx, null, o), modelControl: (o: Parameters<typeof modelControl>[2]) => modelControl(ctx, null, o) };
describe("quota colour is the same everywhere", () => {
    test("a spent quota is red, a half-spent one orange and a fresh one green", () => {
        const html = accountsCard(ctx, null, { accounts: [account(90), account(60), account(10)] });
        expect(html).toContain("text-error");
        expect(html).toContain("text-critical");
        expect(html).toContain("text-success");
    });

    test("the quota heats up in four steps: green, yellow, orange, red", () => {
        const html = accountsCard(ctx, null, { accounts: [account(10), account(30), account(60), account(75)] });
        expect(html).toContain("text-success");
        expect(html).toContain("text-warning");
        expect(html).toContain("text-critical");
        expect(html).toContain("text-error");
    });

    test("a third spent is already yellow, not green", () => {
        const html = accountsCard(ctx, null, { accounts: [account(30)] });
        expect(html).toContain("text-warning");
        // A green connection-status dot is not quota; scope to the account panel.
        const panel = html.slice(html.indexOf('<section id="llm-provider-panel-codex"'), html.indexOf('</section>', html.indexOf('<section id="llm-provider-panel-codex"')));
        expect(panel).not.toBe("");
        expect(panel).not.toContain("text-success");
    });

    test("the configured thresholds decide the colour, not fixed numbers", () => {
        // With the thresholds moved up, 60% is still comfortable.
        const html = accountsCard(ctx, null, { accounts: [account(60, { warnAt: 80, criticalAt: 90, alertAt: 95 })] });
        expect(html).toContain("text-success");
        expect(html).not.toContain("text-warning");
    });

    test("an unknown quota is never painted as if it were known", () => {
        const html = accountsCard(ctx, null, { accounts: [account(null)] });
        expect(html).toContain("usage unavailable");
        // A green connection-status dot is not quota; scope to the account panel.
        const panel = html.slice(html.indexOf('<section id="llm-provider-panel-codex"'), html.indexOf('</section>', html.indexOf('<section id="llm-provider-panel-codex"')));
        expect(panel).not.toBe("");
        expect(panel).not.toContain("text-success");
    });
});
