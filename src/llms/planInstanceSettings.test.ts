import { test, expect } from "bun:test";
import render from "./planInstanceSettings";

const ctx: any = { fns: { procs: { ui: {
    escape: ({ text }: any) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    button: (o: any) => `<button data-action="${o.action}">${o.label}</button>`,
} } } };

test("renders local and trusted instances with the current selection", () => {
    const html = render(ctx, null, { provider: "zai-coding", instance: "box", instances: ["box", "edge"] });
    expect(html).toContain('hx-post="/llms/plan/instance"');
    expect(html).toContain('name="provider" value="zai-coding"');
    expect(html).toContain('<option value="local"');
    expect(html).toContain('<option value="box" selected>');
    expect(html).not.toContain('<option value="edge" selected>');
});

test("falls back to local when the saved instance is gone and disables without instances", () => {
    const gone = render(ctx, null, { provider: "minimax-coding", instance: "ghost", instances: ["edge"] });
    expect(gone).toContain('<option value="local" selected>');
    expect(gone).not.toContain('<option value="ghost"');
    const empty = render(ctx, null, { provider: "minimax-coding", instance: null, instances: [] });
    expect(empty).toContain("disabled");
    expect(empty).toContain("no trusted SSH instances");
});
