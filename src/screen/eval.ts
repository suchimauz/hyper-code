// Send JS to a compatible document and wait for its result. The code is
// an async function body in that document; use an explicit return for a value.
//
// The event only reaches tabs that are subscribed *now* — a page that has just
// loaded has not finished connecting its event stream, and firing into that gap
// looks like a missing consumer. Any event subscriber counts as a listener,
// not proof of this bridge or a particular tab. Wait for a listener first, and
// send again once if the first attempt goes unanswered: a tab that reconnects
// mid-flight (the stream retries with a backoff) would otherwise miss its only
// chance.
/**
 * Evaluate code through the compatibility document bridge and await its result.
 * Requires a connected /ui/control.js consumer, retained in minimal SSR ui.layout
 * but not loaded by the primary React shell. A subscriber count does not prove
 * that this consumer or a specific target is present; the request can time out.
 * The consumer ignores eval events without window.page: the screen client is
 * required even for code that does not call a page helper. For browser automation
 * discover the browser plugin with English keywords, read its workflow and prerequisites.
 * @param opts.code Code to evaluate in the browser.
 * @param opts.timeoutMs Maximum wait in milliseconds.
 */
export default async function (ctx: Context, _session: Session | null, opts: { code: string; timeoutMs?: number }) {
    const page = (ctx.state.screen ??= { nextId: 1, pending: new Map() });
    const id = page.nextId++;
    const timeout = opts.timeoutMs ?? 10_000;

    for (let waited = 0; !listeners(ctx) && waited < 3_000; waited += 50) await Bun.sleep(50);

    const answer = new Promise((resolve, reject) => {
        page.pending.set(id, { resolve, reject });
        setTimeout(() => {
            if (page.pending.has(id)) ctx.fns.procs.events.emit({ event: { type: "eval", id, code: opts.code } });
        }, Math.min(1_500, timeout / 3));
        setTimeout(() => {
            if (!page.pending.delete(id)) return;
            reject(new Error(listeners(ctx) ? `the page did not answer in ${timeout}ms` : "no page answered — is the workspace UI open in a browser?"));
        }, timeout);
    });

    ctx.fns.procs.events.emit({ event: { type: "eval", id, code: opts.code } });
    return answer;
}

function listeners(ctx: Context): number {
    return ctx.state.procs.events?.subs?.size ?? 0;
}
