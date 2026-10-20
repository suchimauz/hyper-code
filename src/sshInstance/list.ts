/**
 * Lists secret-free SSH instance descriptors
 *
 * Use to populate administration and select a configured SSH instance; never includes private keys.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.sshInstance.Instance[]> {
    const rows=await ctx.fns.procs.db.select({sql:"SELECT value FROM settings WHERE module = ? AND scope_type = ? AND key = ? ORDER BY scope_id",params:['sshInstance','instance','descriptor']});
    return rows.map((r: {value: string | types.sshInstance.Instance})=>typeof r.value==='string'?JSON.parse(r.value):r.value);
}
