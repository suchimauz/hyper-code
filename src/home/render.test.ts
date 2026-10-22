import { describe, expect, test } from "bun:test";
import { Window } from 'happy-dom';
import home from "./render";

describe("home", () => {
    test("renders first-run checklist and links", async () => {
        const ctx: any = { fns: { procs: { ui: { escape: ({ text }: any) => text } }, session: { list: async () => [] }, llm: { listAccounts: async () => [] } } };
        const page = await home(ctx, null, {});
        expect(page.main).toContain("Connect an LLM");
        expect(page.main).toContain('href="/llms"');
        expect(page.main).toContain('href="/agent/new"');
        expect(page.main).toContain('href="/files"');
        const w=new Window();try{
            w.document.body.innerHTML=page.main;
            const dashboard=w.document.querySelector('.home-dashboard')!;
            const strip=dashboard.firstElementChild!;
            expect(strip.hasAttribute('data-home-mobile-usage')).toBe(true);
            expect(strip.hasAttribute('data-mobile-usage-open')).toBe(true);
            expect(strip.querySelector('[data-mobile-usage-items]')).not.toBeNull();
            expect(strip.nextElementSibling?.querySelector('h1')?.textContent).toBe('Hyper');
            expect(dashboard.querySelector('main')).toBeNull();
        }finally{await w.happyDOM.close();}
    });

    test("renders recent and running agents with resume link", async () => {
        const ctx: any = { fns: { procs: { ui: { escape: ({ text }: any) => text } }, session: { list: async () => [{ id: "aa", title: "Alpha", runState: "running", unread: 2, workspaceDir: "/tmp/work" }] }, llm: { listAccounts: async () => [{ available: true }] } } };
        const page = await home(ctx, null, {});
        expect(page.main).toContain("Running now");
        expect(page.main).toContain("Alpha");
        expect(page.main).toContain('href="/agent/aa"');
        expect(page.main).toContain("Resume latest");
    });
});
