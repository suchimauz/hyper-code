// Move the workspace's pointer to something and light it up, without touching
// it. This is how the user is shown where to look before anything happens.
//   page.point({ entity: "questionnaire", id: "phq9" })
//   page.point({ action: "materialize" })
//   page.point({ form: "qr-search", field: "q" })
/**
 * Highlights a described UI element without activating it.
 * Requires a compatibility document with /ui/control.js and the screen client
 * (window.page); the primary React shell does not provide this bridge.
 * Uses screen.eval and can time out without a responding consumer.
 * @param opts.entity Entity kind used to identify the UI element.
 * @param opts.id Prompt or UI entity identifier.
 * @param opts.action Action marker used to identify the UI control.
 * @param opts.form Stable form identifier.
 * @param opts.field Field marker used to identify the UI control.
 * @param opts.role Semantic role used to identify the UI element.
 * @param opts.section Named page section.
 * @param opts.delay Delay before highlighting in milliseconds.
 * @param opts.holdMs Highlight duration in milliseconds.
 */
export default async function (ctx: Context, _session: Session | null, opts: types.screen.Descriptor & { delay?: number; holdMs?: number }) {
    return await ctx.fns.screen.eval({ code: `return await window.page.point(${JSON.stringify(opts)})` });
}
