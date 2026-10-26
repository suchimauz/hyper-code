import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import render from "./toggle";

const ctx: any = { fns: { procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text) } } } };

test("toggle keeps its thumb within a 36x20 track", () => {
    const html = render(ctx, null, { name: "sleep", enabled: true, label: "Sleep", hint: "Idle" });
    expect(html).toContain("ui-toggle-input");
    expect(html).toContain("ui-toggle-track");
    expect(html).toContain("ui-toggle-thumb");
    expect(html).toContain("checked");
});

for (const enabled of [false, true]) {
    test(`toggle contains its absolute sr-only checkbox in the label (${enabled})`, () => {
        const window = new Window();
        window.document.body.innerHTML = render(ctx, null, { name: "enabled", enabled, label: "Track entities", hint: "Record observed entities" });
        const label = window.document.querySelector("label")!;
        const input = label.querySelector("input")!;
        // Tailwind sr-only uses position:absolute. Without a positioned label,
        // an offscreen Context control can enlarge the body's scroll overflow.
        expect(label.classList.contains("relative")).toBe(true);
        expect(input.classList.contains("sr-only")).toBe(true);
        expect(input.type).toBe("checkbox");
        expect(input.checked).toBe(enabled);
        expect(input.name).toBe("enabled");
        expect(input.nextElementSibling?.classList.contains("ui-toggle-track")).toBe(true);
        expect(label.textContent).toContain("Track entities");
        window.close();
    });
}
