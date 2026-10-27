import quotaCards from "./quotaCards";
import modelControl from "./modelControl";
import { expect, test } from "bun:test";
import accountsCard from "./accountsCard";
import minimaxSettings from "./minimaxSettings";

const ctx: any = { fns: {
    procs: { ui: {
        escape: ({ text }: any) => String(text),
        row: (o: any) => JSON.stringify(o),
        heading: ({ title, meta }: any) => `${title} ${meta ?? ""}`,
        empty: () => "empty",
        button: (o: any) => JSON.stringify(o),
        toolbar: () => "toolbar",
    } },
    ui: {
        modelLogo: () => "logo",
        popup: (o: any) => JSON.stringify(o),
        live: ({ html }: any) => html,
    },
    llms: { quotaCards: (o: Parameters<typeof quotaCards>[2]) => quotaCards(ctx, null, o), modelControl: (o: Parameters<typeof modelControl>[2]) => modelControl(ctx, null, o), minimaxSettings: (o: any) => minimaxSettings(ctx, null, o) },
} };

const minimaxAccount = { provider: "minimax-coding", account: "default", label: "MiniMax", model: "minimax-coding:", source: "file" as const, available: true, usedPercent: 12, planType: "M Plan", resetsAt: null, parkedAgents: 0 };

test("the MiniMax plan account carries its request settings", () => {
    const html = accountsCard(ctx, null, { accounts: [minimaxAccount], models: {}, minimax: { serviceTier: "priority" } });
    expect(html).toContain('data-provider="minimax-coding"');
    expect(html).toContain("llm-minimax-settings");
    expect(html).toContain('name="minimaxCodingServiceTier"');
    expect(html).not.toContain('name="minimaxCodingMaxTokens"');
    expect(html).toContain("/llms/minimax/settings");
});

test("other providers get no MiniMax settings", () => {
    const html = accountsCard(ctx, null, { accounts: [{ provider: "codex", account: "default", label: "codex", model: "codex:gpt", source: "file", available: true, usedPercent: 1, planType: null, resetsAt: null, parkedAgents: 0 }], models: {}, minimax: { serviceTier: "standard" } });
    expect(html).not.toContain("llm-minimax-settings");
});

test("the settings form shows the tier but no output budget", () => {
    const html = minimaxSettings(ctx, null, { serviceTier: "priority" });
    expect(html).toContain('<option value="priority" selected>');
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain("Max output tokens");
});

test("an unknown tier falls back to standard rather than rendering nonsense", () => {
    const html = minimaxSettings(ctx, null, { serviceTier: "gold" });
    expect(html).toContain('<option value="standard" selected>');
});
