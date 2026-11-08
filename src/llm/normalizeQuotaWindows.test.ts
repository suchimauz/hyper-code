import { describe, expect, test } from "bun:test";
import normalize from "./normalizeQuotaWindows";
import overview from "./usageOverview";

const now = 1_800_000_000_000;
const w = (windowMinutes: number | null, usedPercent = 40, resetsAt = now + 1000) => ({ windowMinutes, usedPercent, resetsAt });
const map = (windows: any) => normalize({} as any, null, { windows, now });

describe("quota duration normalization", () => {
    test("Codex weekly primary is weekly, not five-hour", () => {
        expect(map({ primary: w(10080) })).toEqual({ secondary: w(10080) });
    });
    test("Codex reversed and tertiary slots use measured durations", () => {
        expect(map({ primary: w(43200), secondary: w(300), tertiary: w(10080) })).toEqual({ primary: w(300), secondary: w(10080), tertiary: w(43200) });
    });
    test("Kimi, Z.ai, OpenCode Go and Claude measured periods stay intact", () => {
        for (const windows of [{ primary: w(300), secondary: w(10080) }, { primary: w(300), secondary: w(10080), tertiary: w(43200) }]) {
            expect(map(windows)).toEqual(windows);
        }
    });
    test("unknown periods are preserved, never assigned a fabricated duration", () => {
        const windows = map({ primary: w(null), secondary: w(300), tertiary: w(1440) });
        expect(windows.primary).toEqual(w(300));
        expect(windows.secondary).toEqual(w(null));
        expect(windows.tertiary).toEqual(w(1440));
    });
    test("duplicate periods are retained without replacing their duration", () => {
        expect(Object.values(map({ primary: w(10080, 20), secondary: w(10080, 60) }))).toEqual(expect.arrayContaining([w(10080, 20), w(10080, 60)]));
    });
    test("expired values do not displace live values", () => {
        expect(map({ primary: w(300, 99, now), secondary: w(300, 5) })).toEqual({ primary: w(300, 5) });
    });
    test("overview retains shape and selects worst fresh percentage after mapping", async () => {
        const snapshot = { provider: "codex", account: "default", updatedAt: now, windows: { primary: w(10080, 80), tertiary: w(300, 20) } };
        const ctx: any = { fns: { settings: { getNumber: async ({ fallback }: any) => fallback }, procs: { db: { select: async () => [{ value: JSON.stringify(snapshot) }] } }, llm: { normalizeQuotaWindows: (opts: any) => normalize(ctx, null, opts) } } };
        const rows = await overview(ctx, null, { now });
        expect(rows[0]).toMatchObject({ provider: "codex", usedPercent: 80, tone: "error", windows: { primary: w(300, 20), secondary: w(10080, 80) }, thresholds: { warnAt: 30, criticalAt: 60, alertAt: 75 } });
    });
});
