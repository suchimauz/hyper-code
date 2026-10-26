import { expect, test } from "bun:test";
import tabs from "./tabs";
import pages from "./$widget_pages";
import projects from "./$widget_projects";
import chatItems from "./chatItems";
import rows from "./rows";

test("default overview separates management, preserving saved layouts and hidden tabs", async () => {
    let source = "default"; let layout: any = {};
    const ctx: any = { state: { nav: { widgets: Object.fromEntries(["projects", "chats", "pages"].map(id => [id, { id, module: "nav", sizes: ["tall", "wide"] }])) } }, fns: { nav: { effectiveLayout: async () => ({ source, layout }) } } };
    const result = await tabs(ctx, null, {});
    expect(result.tabs.map(t => t.title)).toEqual(["Обзор", "Возможности", "Управление"]);
    expect(result.tabs[0].widgets.at(-1)?.config).toEqual({ section: "daily" });
    expect(result.tabs[2].widgets[0].config?.section).toBe("management");
    for (source of ["user", "instance"]) {
        layout = { tabs: [{ id: "home", title: "Personal" }] };
        const saved = await tabs(ctx, null, {});
        expect(saved.tabs.map(t => t.id)).toEqual(["home"]);
        expect(saved.tabs[0].widgets.at(-1)?.config).toBeUndefined();
    }
    layout = { tabs: [{ id: "management" }], hidden: ["management"] };
    expect((await tabs(ctx, null, {})).tabs.some(t => t.id === "management")).toBe(false);
});

test("page sections use permission-filtered items and retain explicit nav.pages order", async () => {
    let chosen: string[] | null = null;
    const ctx: any = { fns: { nav: { items: async () => [
        { id: "app:search", label: "Search", href: "/search", group: "System" },
        { id: "app:settings", label: "Settings", href: "/settings", group: "System" },
        { id: "app:work", label: "Work", href: "/work", group: "Work" },
    ] }, settings: { get: async () => chosen } } };
    expect((await pages.render(ctx, null, { size: "wide", config: { section: "daily" } })).items?.map(i => i.href)).toEqual(["/search", "/work"]);
    expect((await pages.render(ctx, null, { size: "wide", config: { section: "management" } })).items?.map(i => i.href)).toEqual(["/settings"]);
    chosen = ["settings", "search"];
    expect((await pages.render(ctx)).items?.map(i => i.href)).toEqual(["/settings", "/search"]);
    expect((await pages.render(ctx, null, { size: "wide", config: { section: "daily" } })).items?.map(i => i.href)).toEqual(["/search"]);
});

test("project avatars use the shared safe renderer and chat rows show exact host project names, not IDs", async () => {
    const projectList = [{ id: "p", title: "Personal project", dir: "/work/repo", host: "remote", icon: "<svg/>" }, { id: "q", title: "/work/repo", dir: "/work/repo", host: "" }];
    const ctx: any = { fns: { projects: { list: async () => projectList }, agent: { teamActivity: async () => ({}) }, chat: { icon: ({ icon }: any) => icon ? "SAFE_ICON" : "MODEL" }, procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(text) } } } };
    const projectRows = (await projects.render(ctx)).items!;
    expect(projectRows[1].label).toBe("repo");
    expect(projectRows[1].detail).toBeUndefined();
    expect(await rows(ctx, null, { items: projectRows })).toContain("data-nav-project-icon");
    const items = await chatItems(ctx, null, { agents: [{ id: "abc", title: "Chat", model: "model", workspaceDir: "/work/repo", workspaceHost: "remote" }] });
    expect(items[0].detail).toBe("Personal project");
    expect(items[0].pin).toBe("agent:abc");
    const html = await rows(ctx, null, { items, pinned: new Set() });
    expect(html).toContain("data-nav-detail");
    expect(html).toContain("Personal project");
    expect(html).not.toContain("data-nav-technical-id");
    expect(html).toContain('/nav/agent/abc/pin');
});
