import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import dial from "../ui/usageDial";
import recordUsage from "./recordUsage";

// These normalization regressions need no registry, browser or Postgres server.
function quotaCtx(): any {
    const values = new Map<string, string>();
    const ctx: any = { fns: {
        llm: { recordUsage: (opts: any) => recordUsage(ctx, null, opts) },
        settings: { getNumber: async () => 75 },
        ui: { notify: async () => undefined },
        procs: {
            events: { refresh: () => undefined },
            db: {
                select: async ({ params }: any) => values.has(params[0]) ? [{ value: values.get(params[0]) }] : [],
                run: async ({ params }: any) => { values.set(params[0], params[1]); },
            },
        },
    } };
    return ctx;
}

const NOW = 1_786_900_000_000;
const escCtx: any = {
    fns: {
        procs: { ui: { escape: ({ text }: any) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)) } },
        ui: { modelLogo: ({ model }: any) => `<span data-logo="${model}"></span>` },
    },
};

describe("llm.recordUsage", () => {
    test("reads Anthropic unified headers into both windows", async () => {
        const ctx: any = await mkTestCtx();
        const snapshot = await ctx.fns.llm.recordUsage({
            provider: "claude-code",
            headers: {
                "anthropic-ratelimit-unified-5h-utilization": "0.784",
                "anthropic-ratelimit-unified-5h-reset": String(Math.floor((NOW + 3_600_000) / 1000)),
                "anthropic-ratelimit-unified-7d-utilization": "0.41",
                "anthropic-ratelimit-unified-7d-reset": String(Math.floor((NOW + 5 * 86_400_000) / 1000)),
            },
            now: NOW,
        });
        expect(snapshot.windows.primary).toMatchObject({ usedPercent: 78.4, windowMinutes: 300 });
        expect(snapshot.windows.secondary).toMatchObject({ usedPercent: 41, windowMinutes: 10080 });
        expect(snapshot.account).toBe("default");
    });

    test("the Codex stream payload supersedes the bare percent header", async () => {
        const ctx: any = await mkTestCtx();
        const snapshot = await ctx.fns.llm.recordUsage({
            provider: "codex",
            headers: { "x-codex-primary-used-percent": "12.5" },
            rateLimits: { primary: { used_percent: 87.2, window_minutes: 300, resets_at: Math.floor((NOW + 7_200_000) / 1000) } },
            now: NOW,
        });
        expect(snapshot.windows.primary).toMatchObject({ usedPercent: 87.2, windowMinutes: 300 });
        expect(snapshot.source).toBe("stream");
    });

    test("partial Codex headers and streams preserve a reported weekly primary", async () => {
        const ctx = quotaCtx();
        const reset = NOW + 86_400_000;
        await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW,
            rateLimits: { primary: { used_percent: 10, window_minutes: 10080, resets_at: reset / 1000 } } });
        const header = await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW + 1,
            headers: { "x-codex-primary-used-percent": "20" } });
        expect(header.windows.primary).toEqual({ usedPercent: 20, windowMinutes: 10080, resetsAt: reset });
        const stream = await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW + 2,
            rateLimits: { primary: { used_percent: 30, window_minutes: null, resets_at: null } } });
        expect(stream.windows.primary).toEqual({ usedPercent: 30, windowMinutes: 10080, resetsAt: reset });
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = ?", params: ["llm:usage:codex:default"] });
        expect(JSON.parse(rows[0].value).windows.primary).toEqual(stream.windows.primary);
    });

    test("Codex respects a new confirmed duration and does not borrow its old reset", async () => {
        const ctx = quotaCtx();
        await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW,
            rateLimits: { primary: { used_percent: 10, window_minutes: 10080, resets_at: (NOW + 86_400_000) / 1000 } } });
        const changed = await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW + 1,
            rateLimits: { primary: { used_percent: 20, window_minutes: 300 } } });
        expect(changed.windows.primary).toEqual({ usedPercent: 20, windowMinutes: 300, resetsAt: null });
    });

    test("Codex never guesses a period or preserves expired resets", async () => {
        const ctx = quotaCtx();
        const fresh = await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW,
            rateLimits: { primary: { used_percent: 10, window_minutes: null } } });
        expect(fresh.windows.primary.windowMinutes).toBeNull();
        await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW,
            rateLimits: { primary: { used_percent: 10, window_minutes: 10080, resets_at: (NOW + 1000) / 1000 } } });
        const expired = await ctx.fns.llm.recordUsage({ provider: "codex", now: NOW + 2000,
            headers: { "x-codex-primary-used-percent": "0" } });
        expect(expired.windows.primary).toEqual({ usedPercent: 0, windowMinutes: 10080, resetsAt: null });
        const other = await ctx.fns.llm.recordUsage({ provider: "codex", account: "other", now: NOW,
            headers: { "x-codex-primary-used-percent": "5" } });
        expect(other.windows.primary.windowMinutes).toBeNull();
    });

    test("reads xAI token/request capacity into a sidebar pressure ring", async () => {
        const ctx: any = await mkTestCtx();
        const snapshot = await ctx.fns.llm.recordUsage({
            provider: "xai",
            headers: {
                "x-ratelimit-limit-tokens": "1000",
                "x-ratelimit-remaining-tokens": "250",
                "x-ratelimit-limit-requests": "100",
                "x-ratelimit-remaining-requests": "90",
            },
            now: NOW,
        });
        expect(snapshot.windows.primary).toMatchObject({ usedPercent: 75, windowMinutes: 1 });
    });


    test("a response carrying no quota information records nothing", async () => {
        const ctx: any = await mkTestCtx();
        expect(await ctx.fns.llm.recordUsage({ provider: "openai", headers: {}, now: NOW })).toBeNull();
    });

    test("spent=true pins the window to 100% with its reset moment", async () => {
        const ctx: any = await mkTestCtx();
        const resetsAt = NOW + 3 * 86_400_000;
        const snapshot = await ctx.fns.llm.recordUsage({ provider: "codex", spent: true, resetsAt, planType: "prolite", now: NOW });
        expect(snapshot.windows.primary).toMatchObject({ usedPercent: 100, resetsAt });
        expect(snapshot.planType).toBe("prolite");
        expect(snapshot.source).toBe("error");
    });

    test("crossing the alert threshold warns once, not on every request", async () => {
        const ctx: any = await mkTestCtx();
        const toasts: any[] = [];
        // Test registry entries are called raw: (ctx, session, opts).
        ctx.fns.ui.notify = async (_c: any, _s: any, o: any) => { toasts.push(o ?? _c); };
        const resets = Math.floor((NOW + 3_600_000) / 1000);

        await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: 70, resets_at: resets } }, now: NOW });
        expect(toasts).toHaveLength(0);

        await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: 87, resets_at: resets } }, now: NOW });
        await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: 91, resets_at: resets } }, now: NOW });
        expect(toasts).toHaveLength(1);
        expect(toasts[0].message).toContain("87%");

        // The window rolled over: the next approach deserves its own warning.
        const later = NOW + 4_000_000;
        await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: 88, resets_at: Math.floor((later + 3_600_000) / 1000) } }, now: later });
        expect(toasts).toHaveLength(2);
    });

    test("accounts of one provider are tracked separately", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.llm.recordUsage({ provider: "codex", account: "work", rateLimits: { primary: { used_percent: 90 } }, now: NOW });
        await ctx.fns.llm.recordUsage({ provider: "codex", account: "personal", rateLimits: { primary: { used_percent: 10 } }, now: NOW });
        const overview = await ctx.fns.llm.usageOverview({ now: NOW });
        expect(overview.map((e: any) => [e.account, e.usedPercent])).toEqual([["work", 90], ["personal", 10]]);
    });
});

describe("llm.usageOverview", () => {
    test("monthly quota dominates weekly and disappears after expiry", async () => {
        const ctx: any = await mkTestCtx();
        const monthlyReset = NOW + 86_400_000;
        const snapshot = await ctx.fns.llm.recordUsage({
            provider: "zai-coding",
            rateLimits: {
                primary: { used_percent: 10, window_minutes: 300, resets_at: (NOW + 3_600_000) / 1000 },
                secondary: { used_percent: 40, window_minutes: 10080, resets_at: (NOW + 5 * 86_400_000) / 1000 },
                tertiary: { used_percent: 92, window_minutes: 43200, resets_at: monthlyReset / 1000 },
            },
            now: NOW,
        });
        expect(snapshot.windows.tertiary).toEqual({ usedPercent: 92, windowMinutes: 43200, resetsAt: monthlyReset });
        const [entry] = await ctx.fns.llm.usageOverview({ now: NOW });
        expect(entry.usedPercent).toBe(92);
        expect(entry.resetsAt).toBe(monthlyReset);
        expect(entry.tone).toBe("error");
        expect(entry.windows.tertiary).toEqual(snapshot.windows.tertiary);
        const [expired] = await ctx.fns.llm.usageOverview({ now: monthlyReset });
        expect(expired.windows.tertiary).toBeUndefined();
        expect(expired.usedPercent).toBe(40);
        expect(expired.resetsAt).toBe(NOW + 5 * 86_400_000);
    });

    test("a tertiary-only snapshot is recorded and becomes neutral when expired", async () => {
        const ctx: any = await mkTestCtx();
        const snapshot = await ctx.fns.llm.recordUsage({
            provider: "zai-coding", rateLimits: { tertiary: { used_percent: 62, window_minutes: 43200, resets_at: (NOW + 1000) / 1000 } }, now: NOW,
        });
        expect(snapshot.windows.tertiary.usedPercent).toBe(62);
        const [expired] = await ctx.fns.llm.usageOverview({ now: NOW + 1000 });
        expect(expired.usedPercent).toBeNull();
        expect(expired.tone).toBe("neutral");
        expect(expired.windows.tertiary).toBeUndefined();
    });

    test("reports the worst window, not the flattering one", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.llm.recordUsage({
            provider: "codex",
            rateLimits: {
                primary: { used_percent: 96, resets_at: Math.floor((NOW + 3_600_000) / 1000) },
                secondary: { used_percent: 12, resets_at: Math.floor((NOW + 5 * 86_400_000) / 1000) },
            },
            now: NOW,
        });
        const [entry] = await ctx.fns.llm.usageOverview({ now: NOW });
        expect(entry.usedPercent).toBe(96);
        expect(entry.tone).toBe("error");
    });

    test("a window whose reset has passed is dropped rather than shown stale", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.llm.recordUsage({
            provider: "codex",
            rateLimits: { primary: { used_percent: 100, resets_at: Math.floor((NOW - 1000) / 1000) } },
            now: NOW - 10_000,
        });
        const [entry] = await ctx.fns.llm.usageOverview({ now: NOW });
        expect(entry.usedPercent).toBeNull();
        expect(entry.tone).toBe("neutral");
    });

    test("the thresholds are settings, not constants", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: 76 } }, now: NOW });

        // Default: red from 75%.
        expect((await ctx.fns.llm.usageOverview({ now: NOW }))[0].tone).toBe("error");

        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "usageAlertPercent", value: 90 });
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "usageCriticalPercent", value: 85 });
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "usageWarnPercent", value: 80 });
        expect((await ctx.fns.llm.usageOverview({ now: NOW }))[0].tone).toBe("neutral");
    });

    test("the quota heats up in four steps, not two", async () => {
        const ctx: any = await mkTestCtx();
        const tone = async (used: number) => {
            await ctx.fns.llm.recordUsage({ provider: "codex", rateLimits: { primary: { used_percent: used } }, now: NOW });
            return (await ctx.fns.llm.usageOverview({ now: NOW }))[0].tone;
        };
        // Green below a third, yellow at a third, orange past 60%, red at 75%.
        expect(await tone(10)).toBe("neutral");
        expect(await tone(30)).toBe("warning");
        expect(await tone(60)).toBe("critical");
        expect(await tone(75)).toBe("error");
    });

    test("includes an active xAI agent in the sidebar before a snapshot exists", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.agent.start({ model: "xai:grok-4.6" });
        const entry = (await ctx.fns.llm.usageOverview({ now: NOW })).find((e: any) => e.provider === "xai");
        expect(entry).toBeDefined();
        expect(entry.model).toBe("xai:grok-4.6");
        expect(entry.usedPercent).toBeNull();
    });


    test("counts the agents parked on each credential", async () => {
        const ctx: any = await mkTestCtx();
        await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.agent.parkOnUsageLimit({
            info: { kind: "usage_limit", provider: "mock", account: "default", message: "spent", retryable: false, resetsAt: NOW + 86_400_000 } as any,
            now: NOW,
        });
        const entry = (await ctx.fns.llm.usageOverview({ now: NOW })).find((e: any) => e.provider === "mock");
        expect(entry.parkedAgents).toBe(2);
        expect(entry.usedPercent).toBe(100);
    });
});

describe("ui.usageDial", () => {
    const entry = (over: any = {}) => ({ provider: "codex", account: "default", label: "codex", model: "codex:gpt-5.6-sol", usedPercent: 78, resetsAt: NOW + 7_200_000, planType: "prolite", parkedAgents: 0, tone: "warning", ...over });

    test("nothing recorded renders nothing", () => {
        expect(dial(escCtx, null, { entries: [], now: NOW })).toBe("");
    });

    test("generic quota remains explicitly unclassified", () => {
        const html = dial(escCtx, null, { entries: [entry({ usedPercent: 50 })], now: NOW });
        // Generic quota has no measured period and cannot become a 5h bar.
        expect(html).toContain("50% used · период неизвестен");
        expect(html).not.toMatch(/>\s*50\s*</);
    });

    test("each ring carries its provider mark", () => {
        const html = dial(escCtx, null, { entries: [entry({ model: "kimi-coding:k3" })], now: NOW });
        expect(html).toContain('data-logo="kimi-coding:k3"');
    });

    test("crossing the thresholds changes the colour", () => {
        expect(dial(escCtx, null, { entries: [entry({ usedPercent: 20, tone: "neutral" })], now: NOW })).toContain("text-faint");
        expect(dial(escCtx, null, { entries: [entry({ usedPercent: 40, tone: "warning" })], now: NOW })).toContain("text-warning");
        expect(dial(escCtx, null, { entries: [entry({ usedPercent: 92, tone: "error" })], now: NOW })).toContain("text-error");
    });

    test("a parked credential shows an error and says how many wait", () => {
        const html = dial(escCtx, null, { entries: [entry({ usedPercent: 100, tone: "error", parkedAgents: 14 })], now: NOW });
        expect(html).toContain("Ошибка квоты");
        expect(html).toContain("14 agent(s) parked");
    });

    test("the tooltip interprets the number instead of just stating it", () => {
        const calm = dial(escCtx, null, { entries: [entry({ usedPercent: 20, tone: "neutral" })], now: NOW });
        expect(calm).toContain("20% used");
        expect(calm).toContain("период неизвестен");
        expect(calm).toContain("5h no data");

        const hot = dial(escCtx, null, { entries: [entry({ usedPercent: 78, tone: "error" })], now: NOW });
        expect(hot).toContain("78% used");
        expect(hot).toContain("Ошибка квоты");
    });

    test("no data draws an empty ring instead of a fake zero", () => {
        const html = dial(escCtx, null, { entries: [entry({ usedPercent: null, tone: "neutral" })], now: NOW });
        expect(html).not.toContain("stroke-dasharray");
        expect(html).toContain("Нет данных");
    });
});
