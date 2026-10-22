import { test, expect } from "bun:test";
import picker from "./modelPickerHtml";
import button from "../procs/ui/button";

function fixture(disabledModels: string[]) {
    const ctx: any = { fns: {
        llm: {
            modelPolicy: async (opts: { action: string }) => {
                expect(opts).toEqual({ action: "list" });
                return { disabledModels };
            },
            listModels: async () => ({ codex: ["codex:test", "codex:enabled"],
                "ssh/alpha": ["ssh/alpha:codex/default:test", "ssh/alpha:codex/work:test"],
                "hyper/mini": ["hyper/mini:codex/default:test", "hyper/mini:codex/work:test"] }),
            listAccounts: async () => [
                { provider: "codex", account: "default", available: true },
                { provider: "codex", account: "work", available: true },
            ],
        },
        node: { list: async () => [] },
        ui: { modelLogo: () => "" },
        procs: { ui: {
            escape: ({ text }: { text: string }) => Bun.escapeHTML(text),
            attr: () => "",
        } },
    } };
    ctx.fns.procs.ui.button = (opts: Parameters<typeof button>[2]) => button(ctx, null, opts);
    return ctx as Context;
}

function row(html: string, route: string): string {
    const result = html.match(new RegExp(`<button[^>]*data-model-route="${route}"[^>]*>[\\s\\S]*?<\\/button>`));
    expect(result).not.toBeNull();
    return result![0];
}

for (const mode of ["agent", "form"] as const) {
    test(`${mode} picker keeps disabled routes visible, selected and inert`, async () => {
        const ctx = fixture(["codex/default:test", "ssh/alpha:codex/default:test", "hyper/mini:codex/default:test"]);
        const html = await picker(ctx, null, { current: "codex/default:test", mode, agentId: "test" });
        for (const route of ["codex:test", "ssh/alpha:codex/default:test", "hyper/mini:codex/default:test"]) {
            const disabled = row(html, route);
            expect(disabled).toContain(' disabled aria-disabled="true"');
            expect(disabled).toContain("Disabled");
            expect(disabled).not.toContain("onclick");
            expect(disabled).not.toContain("hx-post");
            expect(html).not.toContain(`value="${route}"><input type="hidden" name="scope"`);
        }
        expect(row(html, "codex:test")).toContain('aria-current="true"');
        for (const route of ["codex/work:test", "codex:enabled", "ssh/alpha:codex/work:test", "hyper/mini:codex/work:test"]) {
            expect(row(html, route)).not.toContain('aria-disabled="true"');
            if (mode === "form") expect(row(html, route)).toContain("onclick");
            else expect(html).toContain(`value="${route}"><input type="hidden" name="scope"`);
        }
    });
}

test("disabled selected model absent from catalogue is retained", async () => {
    const html = await picker(fixture(["codex:missing"]), null, { current: "codex:missing", mode: "form" });
    expect(row(html, "codex:missing")).toContain('aria-current="true"');
    expect(row(html, "codex:missing")).toContain('aria-disabled="true"');
});

test("default policy spelling disables explicit default selection", async () => {
    const html = await picker(fixture(["codex:test"]), null, { current: "codex/default:test", mode: "form" });
    expect(row(html, "codex:test")).toContain('aria-disabled="true"');
    expect(row(html, "codex:test")).toContain('aria-current="true"');
});

test("named-account policy does not disable the default account", async () => {
    const html = await picker(fixture(["codex/work:test"]), null, { current: "", mode: "form" });
    expect(row(html, "codex/work:test")).toContain('aria-disabled="true"');
    expect(row(html, "codex:test")).not.toContain('aria-disabled="true"');
});

test('Hyper node named default remains its own exact disabled route',async()=>{
 const ctx:any=fixture(['hyper/default:codex/default:test']);
 ctx.fns.llm.listModels=async()=>({'hyper/default':['hyper/default:codex/default:test'],'hyper/other':['hyper/other:codex/default:test']});
 const html=await picker(ctx,null,{current:'hyper/default:codex/default:test',mode:'form'});
 expect(row(html,'hyper/default:codex/default:test')).toContain('aria-disabled="true"');
 expect(row(html,'hyper/other:codex/default:test')).not.toContain('aria-disabled="true"');
});
