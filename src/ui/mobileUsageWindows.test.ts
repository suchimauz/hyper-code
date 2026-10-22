import { expect, test } from "bun:test";
import { Window } from "happy-dom";

const source = await Bun.file(new URL("./$script_mobileUsage.js", import.meta.url)).text();

/** A row with both measured windows: a weekly one outside and a 5h one inside. */
const dualRow = {
    provider: "minimax-coding", account: "default", label: "MiniMax M Plan",
    model: "minimax-coding:", models: ["minimax-coding:MiniMax-M3.1-Flash"],
    usedPercent: 41, resetsAt: Date.now() + 3600000, planType: "M Plan",
    updatedAt: Date.now(), parkedAgents: 0, tone: "neutral",
    thresholds: { warnAt: 50, alertAt: 75 },
    windows: { primary: { usedPercent: 41, resetsAt: Date.now() + 3600000 }, secondary: { usedPercent: 5, resetsAt: Date.now() + 86400000 } },
};

/** Builds a phone-sized page and mounts the mobile usage script on it. */
async function mount(rows: any[]) {
    const w = new Window({ url: "https://local/agent/demo", width: 390, height: 844 });
    w.requestAnimationFrame = () => 0; w.setInterval = (() => 0) as any;
    Object.defineProperty(w.navigator, "maxTouchPoints", { value: 5 });
    w.document.body.innerHTML = `<main id="main"><button type="button" class="mobile-usage-strip" data-mobile-usage-open><span data-mobile-usage-items></span><span data-mobile-usage-count></span></button><div id="messages"></div></main>`;
    w.fetch = (async () => ({ ok: true, json: async () => ({ entries: rows, gateway: null }) })) as any;
    const proto = w.HTMLElement.prototype;
    proto.getBoundingClientRect = function () { return { width: this.hasAttribute("data-mobile-usage-items") ? 330 : this.hasAttribute("data-usage-chip") ? 32 : 0 } as any; };
    w.eval(source);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    return w;
}

test("a plan with two measured windows shows both rings, weekly outside and 5h inside", async () => {
    const w = await mount([dualRow]);
    const svg = w.document.querySelector("[data-usage-chip] svg")!;
    const weekly = svg.querySelector('[data-quota-window="weekly"][data-usage-fill]');
    const short = svg.querySelector('[data-quota-window="5h"][data-usage-fill]');
    expect(weekly).not.toBeNull();
    expect(short).not.toBeNull();
    expect(weekly!.getAttribute("r")).toBe("12");
    expect(short!.getAttribute("r")).toBe("9");
});

test("the weekly ring is filled by the weekly window and the inner ring by the 5h one", async () => {
    const w = await mount([dualRow]);
    const svg = w.document.querySelector("[data-usage-chip] svg")!;
    const weekly = svg.querySelector('[data-quota-window="weekly"][data-usage-fill]')!;
    const short = svg.querySelector('[data-quota-window="5h"][data-usage-fill]')!;
    // 5% of the r=12 circle (circumference 75.40) and 41% of the r=9 one (56.55).
    expect(weekly.getAttribute("stroke-dasharray")!.split(" ")[0]).toBe("3.77");
    expect(short.getAttribute("stroke-dasharray")!.split(" ")[0]).toBe("23.18");
});

test("both rings are coloured by the shared thresholds, not by the provider", async () => {
    const w = await mount([dualRow]);
    const chip = w.document.querySelector("[data-usage-chip]")! as HTMLElement;
    // The weekly window is at 5% and the 5h one at 41% — both below the 50%
    // warning threshold, so the chip stays green.
    expect(chip.getAttribute("data-tone")).toBe("success");
});

test("a nearly spent weekly window turns the chip red", async () => {
    const w = await mount([{ ...dualRow, windows: { primary: { usedPercent: 20, resetsAt: Date.now() + 3600000 }, secondary: { usedPercent: 80, resetsAt: Date.now() + 86400000 } } }]);
    const chip = w.document.querySelector("[data-usage-chip]")! as HTMLElement;
    expect(chip.getAttribute("data-tone")).toBe("error");
});

test("a plan with a single window keeps one ring", async () => {
    // A provider that is not one of the two-window coding plans: one measured
    // window means one ring.
    const w = await mount([{ ...dualRow, provider: "codex", label: "Codex", windows: { primary: { usedPercent: 20, resetsAt: Date.now() + 3600000 } } }]);
    const svg = w.document.querySelector("[data-usage-chip] svg")!;
    expect(svg.querySelector('[data-quota-window="weekly"]')).toBeNull();
    expect(svg.querySelector('[data-quota-window="5h"]')).toBeNull();
    expect(svg.querySelector("[data-usage-fill]")).not.toBeNull();
});

test("the account card names the weekly and the 5h limit separately", async () => {
    const w = await mount([dualRow]);
    (w.document.querySelector("[data-mobile-usage-open]") as any).click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const text = w.document.body.textContent ?? "";
    expect(text).toContain("Недельный лимит");
    expect(text).toContain("Лимит за 5 часов");
});
