// Visible text of the driven page or one element. Default to #main, not body:
// the workspace body also contains the chat transcript, which is not the page
// being tested.
/**
 * Read text from a document responding to the screen.eval compatibility bridge.
 * The primary React shell does not load /ui/control.js; this may time out and
 * does not select or verify a browser target.
 * @param opts.selector Optional CSS selector to scope text extraction.
 */
export default function (ctx: Context, _session: Session | null, opts: { selector?: string } = {}) {
    const sel = JSON.stringify(opts.selector ?? "#main");
    return ctx.fns.screen.eval({ code: `return document.querySelector(${sel})?.innerText ?? null` });
}
