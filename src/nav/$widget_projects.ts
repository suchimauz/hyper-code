/** Core menu widget: visible active projects as native folder rows, with access to the personal archive. */
export default {
    title: "Projects",
    icon: "ph-folder-open",
    description: "Active workspace projects and archived projects",
    sizes: ["tall", "L", "M"],
    async render(ctx: Context): Promise<types.nav.WidgetOutput> {
        const projects = await ctx.fns.projects.list({});
        const items: types.nav.Item[] = projects.filter(project => !project.archived).map(project => ({
            id: `project:${project.id}`,
            label: project.title,
            href: `/projects/view?projectId=${encodeURIComponent(project.id)}`,
            icon: "ph-folder-open",
            detail: project.host ? `${project.host}:${project.dir}` : project.dir,
            unread: !!project.unreadCount,
            hint: project.runningCount ? `${project.runningCount} running` : undefined,
        }));
        return { items, sections: [{ items: [{ id: "projects:archive", label: "Archived projects", href: "/projects/archive", icon: "ph-archive" }] }] };
    },
} satisfies types.nav.Widget;
