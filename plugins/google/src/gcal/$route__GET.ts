/** Google Calendar day page: one day of your own calendars across every authorized account, each event with its details. Native React owns calendar rendering. */
export default async function (_ctx: Context, _session: Session | null, opts: { /** Incoming HTTP request. */ req: Request }) {
    const u = new URL(opts.req.url);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("date") ?? "") ? u.searchParams.get("date")! : "";
    const query = new URLSearchParams({ view: "extension:visualizations/calendar" });
    if (date) query.set("date", date);
    return new Response(null, { status: 302, headers: { Location: `/?${query}` } });
}
