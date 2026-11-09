import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const agentRow = (over: Record<string, any> = {}) => ({ id: "a1", model: "anthropic:claude-opus-4-5", title: "Header test", messages: [], events: [], scratchpad: {}, workspaceDir: "/tmp/proj", workspaceHost: "", systemPrompt: "", parentId: null, ...over });

async function ctxWithAgent(over: Record<string, any> = {}) {
    const ctx: any = await mkTestCtx();
    const agent = agentRow(over);
    ctx.state.agent = { a1: agent };
    ctx.state.registry.session.getMaxEventIdx = () => -1;
    ctx.state.registry.session.getEvents = () => [];
    ctx.state.registry.session.getFullMessages = () => [];
    ctx.state.registry.session.getMessages = () => [];
    return { ctx, agent };
}

describe("shared chat icon renderer", () => {
    test("icon: running ring around the logo, live ring follows the header status", async () => {
        const ctx: any = await mkTestCtx();
        const running = ctx.fns.chat.icon({ model: "anthropic:claude-opus-4-5", active: true });
        expect(running).toContain("chat-icon-ring");
        expect(running).not.toContain("animate-spin");
        expect(ctx.fns.chat.icon({ model: "anthropic:claude-opus-4-5", live: true, size: "md" })).toContain("chat-icon-ring--live");
        expect(ctx.fns.chat.icon({ model: "anthropic:claude-opus-4-5" })).not.toContain("chat-icon-ring");
    });

    test("GET /chat/:id/panel is retired", async () => {
        const { ctx } = await ctxWithAgent();
        const res = await ctx.fns.procs.http.dispatch({ method: "GET", url: "/chat/a1/panel" });
        expect(res.status).toBe(404);
    });
});

describe("chat icon", () => {
    test("sanitizeSvg keeps drawing and drops scripts, handlers, foreign content and external refs", async () => {
        const ctx: any = await mkTestCtx();
        const out = ctx.fns.chat.sanitizeSvg({ svg: `<?xml version="1.0"?><svg width="32" height="32" onload="alert(1)"><script>alert(2)</script><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)" onclick="x()"/><image href="https://evil/x.png"/><use href="https://evil/#a"/><use href="#g"/><foreignObject><div>hi</div></foreignObject><rect style="fill:url(https://evil)" width="3" height="3"/><a href="javascript:alert(3)"><text>t</text></a></svg>` });
        expect(out).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(out).toContain('viewBox="0 0 32 32"');
        expect(out).toContain('fill="url(#g)"');
        expect(out).toContain('<use href="#g"');
        for (const bad of ["script", "onload", "onclick", "evil", "foreignObject", "javascript", "<image", "<a "]) expect(out).not.toContain(bad);
    });

    test("sanitizeSvg rejects non-svg, sizeless and oversized input", async () => {
        const ctx: any = await mkTestCtx();
        expect(() => ctx.fns.chat.sanitizeSvg({ svg: "<div>x</div>" })).toThrow("exactly one <svg>");
        expect(() => ctx.fns.chat.sanitizeSvg({ svg: "<svg><rect/></svg>" })).toThrow("viewBox");
        const big = `<svg viewBox="0 0 1 1">${'<rect width="1" height="1"/>'.repeat(400)}</svg>`;
        expect(() => ctx.fns.chat.sanitizeSvg({ svg: big })).toThrow("larger than");
    });

    test("setIcon stores emoji/svg, icon draws it as an image with a model mark, reset returns the logo", async () => {
        const { ctx } = await ctxWithAgent();
        await ctx.fns.session.save({ agent: ctx.state.agent.a1 });
        const emoji = await ctx.fns.chat.setIcon({ id: "a1", emoji: "🦊", background: "#7c3aed" });
        expect(emoji.icon).toContain("🦊");
        expect(ctx.state.agent.a1.icon).toBe(emoji.icon);
        expect((await ctx.fns.session.load({ id: "a1" })).icon).toBe(emoji.icon);
        const drawn = ctx.fns.chat.icon({ icon: emoji.icon, model: "anthropic:claude-opus-4-5", size: "md" });
        expect(drawn).toContain('<img src="data:image/svg+xml,');
        expect(drawn).toContain("chat-icon");
        await expect(ctx.fns.chat.setIcon({ id: "a1", emoji: "x", background: "red;}" })).rejects.toThrow("CSS colour");
        await expect(ctx.fns.chat.setIcon({ id: "a1" })).rejects.toThrow("exactly one");
        const svg = await ctx.fns.chat.setIcon({ id: "a1", svg: '<svg viewBox="0 0 8 8"><rect width="8" height="8" onclick="x"/></svg>' });
        expect(svg.icon).not.toContain("onclick");
        expect((await ctx.fns.chat.setIcon({ id: "a1", reset: true })).icon).toBeNull();
        expect(ctx.fns.chat.icon({ icon: null, model: "anthropic:claude-opus-4-5" })).not.toContain("<img");
    });

});
