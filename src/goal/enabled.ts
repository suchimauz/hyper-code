/**
 * Check whether isolated goal storage APIs are explicitly enabled.
 *
 * Fail closed unless goal.enabled resolves to boolean true. This check must precede reads of the new goal tables.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<boolean> {
    return (await ctx.fns.settings.get({module:'goal',scopeType:'global',key:'enabled'})) === true;
}
