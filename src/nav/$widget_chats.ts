// Core widget: New agent, the viewer's unread @mentions, pinned chats and recent chats.
export default {
    title: "Продолжить работу",
    icon: "ph-chats-circle",
    description: "New agent, unread mentions, pinned chats and the most recent chats",
    sizes: ["tall", "L", "M"],
    config: { limit: { type: "number", default: 50, description: "How many recent chats to list" } },
    async render(ctx: Context, _session: Session | null, opts: { size: types.nav.Size; config: Record<string, unknown> }): Promise<types.nav.WidgetOutput> {
        const limit = Math.max(1, Math.min(200, Number(opts.config.limit ?? 50) || 50));
        const [agents, mentions, pinnedIds] = await Promise.all([
            ctx.fns.nav.agents({ limit }).catch(() => [] as any[]),
            ctx.fns.mentions.list({ unreadOnly: true, limit: 10 }).catch(() => []),
            ctx.fns.auth.pinnedIds({}).catch(() => new Set<string>()),
        ]);
        const chatItems = await ctx.fns.nav.chatItems({ agents });
        const pinnedAgents = pinnedIds.size ? (await ctx.fns.nav.agents({ limit: 500 }).catch(() => [] as any[])).filter((a: any) => pinnedIds.has(String(a.id))) : [];
        const mentionItems = mentions.length ? await ctx.fns.mentions.rowsData({ items: mentions }) : [];
        return {
            items: opts.config.hideNewChat === true ? [] : [{ id: "new-chat", label: "Новый чат", href: "/?newSession=1", icon: "ph-plus-circle" }],
            sections: [
                ...(mentions.length ? [{ title: `Упоминания · ${mentions.length}`, items: mentionItems, tone: "primary" as const }] : []),
                ...(pinnedAgents.length ? [{ title: "Закреплённые", items: await ctx.fns.nav.chatItems({ agents: pinnedAgents }), tone: "warning" as const }] : []),
                { title: "Недавние чаты", items: chatItems },
            ],
        };
    },
} satisfies types.nav.Widget;
