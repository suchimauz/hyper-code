// Fill a form the workspace rendered. Fields resolve by their input name, by
// `data-field`, or — in a rendered Questionnaire — by the item's linkId, so the
// caller never has to know that formbox names its inputs `fb[answer][…]`.
//
// A name that resolves to nothing is reported in `missing` together with the
// names that do exist, rather than throwing: the recovery is to look at the list.
/**
 * Fills fields in a named browser form.
 * Requires a compatibility document with /ui/control.js and the screen client
 * (window.page); the primary React shell does not provide this bridge.
 * Uses screen.eval and can time out without a responding consumer.
 * @param opts.form Stable form identifier.
 * @param opts.values Field names and values to fill.
 * @param opts.show Whether to animate the browser interaction.
 */
export default async function (ctx: Context, _session: Session | null, opts: { form: string; values: Record<string, string | number | boolean>; show?: boolean }) {
    const result: any = await ctx.fns.screen.eval({ code: `return await window.page.fill(${JSON.stringify(opts)})` });
    if (result.missing?.length) throw new Error(`no such fields in "${opts.form}": ${result.missing.join(", ")} — have ${(result.fields ?? []).join(", ")}`);
    return result;
}
