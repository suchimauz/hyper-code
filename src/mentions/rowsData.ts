/**
 * Build structured mention destinations for native navigation
 *
 * Use with mentions.list results to produce plain-text navigation rows with message anchors, attribution and unread state. Returns data only; native consumers escape displayed text.
 * @param opts.items Mention records in display order, including message location and read state.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Mention records in display order, including message location and read state. */
        items: Array<{ id: number; agentId: string; agentTitle: string | null; messageIdx: number; from: string | null; excerpt: string; createdAt: number; readAt: number | null }>;
    },
): Promise<types.nav.Item[]> {
    if (!opts.items.length) return [];
        const people = new Map((await ctx.fns.mentions.people({})).map((p) => [p.id, p.name]));
        const who = (from: string | null) => !from ? "someone" : from.startsWith("agent:") ? `agent ${from.slice(6)}` : people.get(from) ?? from;
        const time = (ts: number) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
        return opts.items.map((m) => ({
            id: `mention:${m.id}`,
            label: `${who(m.from)} in ${m.agentTitle || m.agentId}`,
            href: `/agent/${encodeURIComponent(m.agentId)}#m-${m.messageIdx}`,
            detail: m.excerpt,
            hint: time(m.createdAt),
            icon: "ph-at",
            unread: m.readAt === null,
            pin: `agent:${m.agentId}`,
        }));
}
