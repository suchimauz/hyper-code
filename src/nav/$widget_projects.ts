/** Core menu widget: visible active projects as native folder rows, with access to the personal archive. */
export default {
    title: "Проекты",
    icon: "ph-folder-open",
    description: "Active workspace projects and archived projects",
    sizes: ["tall", "L", "M"],
    async render(ctx: Context): Promise<types.nav.WidgetOutput> {
        const projects = await ctx.fns.projects.list({});
        const items: types.nav.Item[] = projects.filter(project => !project.archived).map(project => ({
            id: `project:${project.id}`,
            label: project.title && !project.title.startsWith("/") ? project.title : project.dir.split("/").filter(Boolean).at(-1) || "/",
            href: `/projects/view?projectId=${encodeURIComponent(project.id)}`,
            icon: "ph-folder-open",
            ...(project.icon ? { avatar: project.icon } : {}),
            detail: project.host || undefined,
            unread: !!project.unreadCount,
            unreadCount: project.unreadCount,
            hint: project.runningCount ? `${project.runningCount} в работе` : undefined,
        }));
        return { items, sections: [{ items: [{ id: "projects:archive", label: "Архив проектов", href: "/projects/archive", icon: "ph-archive" }] }] };
    },
} satisfies types.nav.Widget;
