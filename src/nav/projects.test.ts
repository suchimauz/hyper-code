import { expect, test } from "bun:test";
import projects from "./$widget_projects";
import chats from "./$widget_chats";
import tabs from "./tabs";
import rows from "./rows";

// Pure context doubles: no database, saved settings, filesystem, or live agents are mutated.
test("projects menu uses active native project rows and always exposes archive", async () => {
    let calls = 0;
    const ctx: any = { fns: { projects: { list: async (opts: object) => {
        expect(opts).toEqual({}); calls++;
        return [
            { id: "virtual:/a?b", title: "<Project>", dir: "/a?b", host: "server", runningCount: 2, unreadCount: 1 },
            { id: "archived", title: "Hidden", dir: "/hidden", host: "", archived: true },
            { id: "empty", title: "Empty project", dir: "/empty", host: "", archived: false },
        ];
    } }, procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text) } } } };
    const output = await projects.render(ctx);
    expect(calls).toBe(1);
    expect(output.html).toBeUndefined();
    expect(output.items?.map(i => i.id)).toEqual(["project:virtual:/a?b", "project:empty"]);
    expect(output.items?.[0]).toMatchObject({ href: "/projects/view?projectId=virtual%3A%2Fa%3Fb", icon: "ph-folder-open", unread: true, hint: "2 в работе", detail: "server" });
    expect(output.sections?.[0]?.items?.[0]).toMatchObject({ href: "/projects/archive", label: "Архив проектов" });
    const html = await rows(ctx, null, { items: output.items ?? [] });
    expect(html).toContain('class="nav-row');
    expect(html).toContain("&lt;Project&gt;");
    expect(html).toContain('data-nav-unread-count');
    expect(html).not.toContain("/files?path=");
});

test("empty project list keeps the archive reachable", async () => {
    const ctx: any = { fns: { projects: { list: async () => [] } } };
    const output = await projects.render(ctx);
    expect(output.items).toEqual([]);
    expect(output.sections?.[0]?.items?.[0]?.href).toBe("/projects/archive");
});

test("default home orders projects before chats and pages; saved layout remains authoritative", async () => {
    let layout: object = {};
    const ctx: any = {
        state: { nav: { widgets: Object.fromEntries(["projects", "chats", "pages"].map(id => [id, { id, module: "nav", sizes: ["tall"] }])) } },
        fns: { nav: { effectiveLayout: async () => ({ layout, source: Object.keys(layout).length ? "user" : "default" }) } },
    };
    expect((await tabs(ctx, null, {})).tabs[0]?.widgets.map(w => w.widget)).toEqual(["projects", "chats", "pages"]);
    layout = { tabs: [{ id: "home", widgets: [{ widget: "pages" }, { widget: "chats" }] }] };
    const before = JSON.stringify(layout);
    expect((await tabs(ctx, null, {})).tabs[0]?.widgets.map(w => w.widget)).toEqual(["pages", "chats"]);
    expect(JSON.stringify(layout)).toBe(before);
});

test("new agent opens ordinary creation popup without preselecting a project", async () => {
    let popupArgs: any;
    const ctx: any = { fns: {
        nav: { agents: async () => [], chatItems: async () => [] },
        mentions: { list: async () => [] }, auth: { pinnedIds: async () => new Set() },
        ui: { popup: (opts: object) => { popupArgs = opts; return "popup trigger"; } },
    } };
    const output = await chats.render(ctx, null, { size: "tall", config: {} });
    expect(output.html).toBe("popup trigger");
    expect(popupArgs).toMatchObject({ method: "ui.newAgentPopup", params: {} });
    expect(popupArgs.attrs).toContain("data-nav-default");
    expect(popupArgs.attrs).toContain("nav-row");
});
