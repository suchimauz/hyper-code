import { expect, test } from "bun:test";
import statusBadge from "./statusBadge";

const escape = ({ text }: any) => String(text)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const ctx: any = { fns: { procs: { ui: { escape } } } };

test("status badge uses semantic tones and escapes content", () => {
    const html = statusBadge(ctx, null, { label: "needs <user>", tone: "warning", dot: true });
    expect(html).toContain("border-error/30");
    expect(html).toContain("text-error");
    expect(html).toContain("needs &lt;user&gt;");
    expect(html).toContain("bg-current");
});
