import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry.ts";
import { Window } from "happy-dom";

describe("ui.layout", () => {
    // The bug this guards against: navigation attributes were declared on the
    // section that WRAPS the page. htmx inherits hx-target/hx-swap/hx-push-url
    // into every descendant, so the chat's tail poll — sitting inside #main —
    // answered itself by replacing the whole page and pushing
    // `/agent/wk/events.html?offset=62` into the address bar.
    test("the container that holds the page owns no navigation", async () => {
        const ctx: any = await mkTestCtx();
        const html = await ctx.fns.ui.layout({ main: "<p>page</p>", title: "t" });

        const pageView = /<section id="page-view"[^>]*>/.exec(html)?.[0] ?? "";
        expect(pageView).not.toBe("");
        for (const attr of ["hx-target", "hx-swap", "hx-push-url", "hx-boost"]) {
            expect(pageView).not.toContain(attr);
        }
        expect(html).toContain('<main id="main"');
        expect(html).toContain("<p>page</p>");
    });

    test("navigation is the palette, not a tab strip", async () => {
        const ctx: any = await mkTestCtx();
        const html = await ctx.fns.ui.layout({ main: "", title: "t" });

        expect(html).toContain('id="nav-overlay"');
        expect(html).not.toContain('id="agents-rail"');
        // No agent rail or tabs: reaching a page goes through the global menu;
        // quick access is only a thin strip of pinned page icons.
        expect(html).toContain('id="dock"');
        expect(html).not.toContain('data-action="open-tab"');
        const dock=/<nav id="dock"[\s\S]*?<\/nav>/.exec(html)?.[0]??'';
        expect(dock).toContain('data-dock-id="menu"');
        expect(dock).toContain('id="theme-toggle"');
    });

    test("initializes and exposes a persisted light-dark theme switcher", async () => {
        const ctx: any = await mkTestCtx();
        const html = await ctx.fns.ui.layout({ main: "", title: "t" });
        expect(html).toContain("localStorage.getItem('hyper-theme')");
        expect(html).toContain("prefers-color-scheme: dark");
        expect(html).toContain('id="theme-toggle"');
        expect(html).toContain('class="bg-base-200 text-base-content text-sm h-screen"');
    });

    test("provides one reusable dotted surface for chat and content pages", async () => {
        const ctx: any = await mkTestCtx();
        const html = await ctx.fns.ui.layout({ main: "", title: "t" });
        expect(html).toContain(".dot-grid-surface {");
        expect(html).toContain("background-image: radial-gradient");
    });



    test("embed mode renders only the page surface for iframe previews", async () => {
        const ctx: any = await mkTestCtx();
        const session: any = { url: new URL("http://localhost/files/absolute/tmp/readme.md?embed=1"), req: new Request("http://localhost/files/absolute/tmp/readme.md?embed=1") };
        const html = await ctx.state.registry.ui.layout(ctx, session, { main: "<p>embedded</p>", title: "file" });
        expect(html).toContain("<p>embedded</p>");
        expect(html).not.toContain('id="dock"');
        expect(html).not.toContain('id="app-popup"');
        expect(html).not.toContain('id="nav-overlay"');
        expect(html).toContain("window.parent.postMessage({type:'ui.close-popup'}");
    });


    test("sidebar presentation reuses the live page without navigation and keeps popup hosts", async () => {
        const ctx: any = await mkTestCtx();
        const url = new URL("http://localhost/agent/ab?presentation=sidebar");
        const session: any = { url, req: new Request(url.toString()) };
        const main = '<div data-page="agent"><section id="chat-panel"><header>Chat</header><div id="messages" data-stream="live"></div></section><aside id="agent-meta-ab">Meta</aside></div>';
        const html = await ctx.state.registry.ui.layout(ctx, session, { main, currentId: "ab" });
        expect(html).toContain(main);
        expect(html).toMatch(/<body[^>]*data-presentation="sidebar"/);
        expect(html).toContain('data-agent-id="ab"');
        for (const id of ["dock", "nav-overlay", "mobile-nav-button", "theme-toggle"]) {
            expect(html).not.toContain(`id="${id}"`);
        }
        for (const id of ["app-popup", "app-popup-body", "secure-input-host"]) {
            expect(html).toContain(`id="${id}"`);
        }
        for (const script of ["/agent/chat.js", "/procs/events/client.js", "/ui/hotkeys.js", "/ui/popup.js", "/ui/meta.js"]) {
            expect(html).toContain(`src="${script}"`);
        }
        // These scoped overrides follow (rather than live inside) the mobile media query.
        expect(html).toMatch(/}\s*\/\* Sidebar presentation/);
        expect(html).toContain('body[data-presentation="sidebar"] [data-page="agent"] > aside[id^="agent-meta-"] { display: none !important; }');
        expect(html).toContain('body[data-presentation="sidebar"] #mobile-nav-button,');
        expect(html).toContain('body[data-presentation="sidebar"] #chat-panel > header { padding-left: .55rem !important; }');
        expect(html).toContain("event.data?.type!=='ui.close-popup'");
    });

    test("sidebar is explicit and does not change ordinary or embedded pages", async () => {
        const ctx: any = await mkTestCtx();
        for (const query of ["", "?presentation=other", "?presentation=sidebar&embed=1"]) {
            const url = new URL(`http://localhost/agent/ab${query}`);
            const html = await ctx.state.registry.ui.layout(ctx, { url, req: new Request(url.toString()) }, { main: "page" });
            expect(html).not.toMatch(/<body[^>]*data-presentation="sidebar"/);
            if (query.includes("embed=1")) {
                expect(html).not.toContain('id="app-popup"');
                expect(html).not.toContain('id="nav-overlay"');
                expect(html).toContain("window.parent.postMessage({type:'ui.close-popup'}");
            } else {
                expect(html).toContain('id="app-popup"');
                expect(html).toContain('id="nav-overlay"');
                expect(html).toContain('id="mobile-nav-button"');
            }
        }
    });

    test("chat input prevents iPhone focus zoom without disabling manual zoom or changing desktop text", async () => {
        const ctx: any = await mkTestCtx();
        const composer = await ctx.fns.ui.chatComposer({ action: "/agent/ab/send" });
        const html = await ctx.fns.ui.layout({ main: composer });
        const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join("\n");
        // The anti-zoom rule must target the editable node, not just its glass wrapper.
        expect(styles).toContain('.chat-composer textarea[name="text"] { font-size: max(16px, 1.0625rem) !important; line-height: 1.5; }');
        const viewport = /<meta name="viewport"[^>]*>/.exec(html)?.[0] ?? "";
        expect(viewport).toContain("initial-scale=1");
        expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=/i);

        for (const { width, touchPoints, expected } of [
            { width: 390, touchPoints: 5, expected: "16px" },
            { width: 844, touchPoints: 5, expected: "16px" },
            { width: 600, touchPoints: 0, expected: "16px" },
            { width: 1280, touchPoints: 0, expected: "14px" },
        ]) {
            const window = new Window({ width, height: 844, settings: { enableJavaScriptEvaluation: false } });
            try {
                Object.defineProperty(window.navigator, "maxTouchPoints", { value: touchPoints });
                window.document.body.innerHTML = composer;
                const style = window.document.createElement("style");
                // Model Tailwind's explicit text-sm: font-size on the wrapper cannot override it.
                // happy-dom does not resolve comma-separated media queries or max(rem,px)
                // correctly. This test checks the 16px safety floor; mobileDesign.test checks
                // the actual scalable declaration and desktop/mobile rule boundaries.
                const resolvedMedia = styles.replace(/@media\s+([^{}]+)\{/g, (_match, query: string) =>
                    `@media ${query.split(',').some(part => window.matchMedia(part.trim()).matches) ? '(min-width: 0px)' : '(min-width: 999999px)'} {`);
                style.textContent = `.text-sm { font-size: 14px; }\n${resolvedMedia.replaceAll('max(16px, 1.0625rem)', '16px')}`;
                window.document.head.append(style);
                const input = window.document.querySelector("textarea[name='text']")!;
                expect(window.getComputedStyle(input).fontSize).toBe(expected);
            } finally {
                await window.happyDOM.close();
            }
        }
    });

    test("host layout closes its popup when an embedded Files frame sends Escape", async () => {
        const ctx: any = await mkTestCtx();
        const html = await ctx.fns.ui.layout({ main: "", title: "t" });
        expect(html).toContain("event.data?.type!=='ui.close-popup'");
        expect(html).toContain("dialog.close()");
    });

});
