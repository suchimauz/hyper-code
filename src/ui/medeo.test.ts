import { expect, test } from "bun:test";
import vendor from "./$route_vendor_$name_GET";
import gate from "../$middleware";

const names = ["medeo-sans.woff2", "medeo-sans-italic.woff2", "medeo-mono.woff2", "medeo-mono-italic.woff2"];

test("Medeo CSS uses local variable fonts, normal and italic, with shared theme tokens", async () => {
    const res = await vendor({} as any, null, { params: { name: "medeo.css" } });
    const css = await res.text();
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css.match(/font-weight: 100 900/g)).toHaveLength(4);
    expect(css.match(/font-display: swap/g)).toHaveLength(4);
    for (const name of names) expect(css).toContain(`/ui/vendor/${name}`);
    expect(css).toContain("--font-sans:var(--font-medeo-sans)");
    expect(css).toContain("--font-mono:var(--font-medeo-mono)");
    expect(css).not.toContain("https://");
});

for (const name of names) test(`${name} is served from the installed package as valid WOFF2`, async () => {
    const res = await vendor({} as any, null, { params: { name } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("font/woff2");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("wOF2");
    expect(bytes.length).toBeGreaterThan(1000);
});

test("only exact read-only font assets bypass sign-in", async () => {
    const ctx: any = { fns: { h2: { redirect: () => null }, auth: { currentUser: async () => ({ required: true }) } } };
    for (const name of ["medeo.css", ...names]) {
        expect(await gate(ctx, null, { req: new Request(`http://localhost/ui/vendor/${name}`) })).toBeUndefined();
        const denied = await gate(ctx, null, { req: new Request(`http://localhost/ui/vendor/${name}`, { method: "POST" }) });
        expect(denied?.status).toBe(401);
    }
    for (const name of ["other.woff2", "medeo.css/extra", "medeo-sans.woff2.bak"]) {
        expect((await gate(ctx, null, { req: new Request(`http://localhost/ui/vendor/${name}`) }))?.status).toBe(401);
    }
});

test("app shell loads font faces explicitly and code editor uses the shared mono token", async () => {
    const layout = await Bun.file(new URL("./layout.ts", import.meta.url)).text();
    expect(layout).toContain('<link rel="stylesheet" href="/ui/vendor/medeo.css">');
    const styles = await Bun.file(new URL("../procs/styles/$style_app.css", import.meta.url)).text();
    expect(styles).toContain('--font-sans: "Medeo Sans"');
    expect(styles).toContain('--font-mono: "Medeo Mono"');
    expect(styles).toContain("pre, code, kbd, samp { font-family: var(--font-mono); }");
    const editor = await Bun.file(new URL("../files/$script_editor.js", import.meta.url)).text();
    expect(editor).toContain('fontFamily: "var(--font-mono)"');
});
