export const hint = "one day of the person's Google Calendar (own calendars of all accounts, live), each event with details — args `{ date?: \"YYYY-MM-DD\" }` (default today)";

export default {
    icon: "calendar-blank",
    live: true,
    liveState: true,
    prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(opts.args.date ?? "")) ? String(opts.args.date) : undefined;
        return { args: date ? { date } : {}, title: "Calendar" };
    },
    render() { return '<p>This visualization is available in the native Hyper Canvas.</p>'; },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) {
        const s = { ...opts.item.args, ...opts.item.state };
        return `Google Calendar day ${s.date ?? "(today)"} — same data: gcal.agenda({ from, to })`;
    },
} satisfies types.canvas.Kind;
