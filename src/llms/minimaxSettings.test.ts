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
    llms: { minimaxSettings: (o: any) => minimaxSettings(ctx, null, o) },
} };

const minimaxAccount = { provider: "minimax-coding", account: "default", label: "MiniMax M Plan", model: "minimax-coding:", source: "file" as const, available: true, usedPercent: 12, planType: "M Plan", resetsAt: null, parkedAgents: 0 };

test("the MiniMax plan account carries its request settings", () => {
    const html = accountsCard(ctx, null, { accounts: [minimaxAccount], models: {}, minimax: { serviceTier: "priority", maxTokens: 32768 } });
    expect(html).toContain('data-provider="minimax-coding"');
    expect(html).toContain("llm-minimax-settings");
    expect(html).toContain('name="minimaxCodingServiceTier"');
    expect(html).toContain('name="minimaxCodingMaxTokens"');
    expect(html).toContain("/llms/minimax/settings");
});

test("other providers get no MiniMax settings", () => {
    const html = accountsCard(ctx, null, { accounts: [{ provider: "codex", account: "default", label: "codex", model: "codex:gpt", source: "file", available: true, usedPercent: 1, planType: null, resetsAt: null, parkedAgents: 0 }], models: {}, minimax: { serviceTier: "standard", maxTokens: 16384 } });
    expect(html).not.toContain("llm-minimax-settings");
});

test("the settings form shows the current tier and budget", () => {
    const html = minimaxSettings(ctx, null, { serviceTier: "priority", maxTokens: 32768 });
    expect(html).toContain('<option value="priority" selected>');
    expect(html).toContain('value="32768"');
    expect(html).toContain("Thinking tokens count against this budget");
});

test("an unknown tier falls back to standard rather than rendering nonsense", () => {
    const html = minimaxSettings(ctx, null, { serviceTier: "gold", maxTokens: 16384 });
    expect(html).toContain('<option value="standard" selected>');
});
