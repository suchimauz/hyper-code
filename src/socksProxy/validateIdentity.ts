/**
 * Validate a saved proxy UUID and optional optimistic revision
 *
 * Use before saved proxy reads or conditional writes to reject malformed identifiers and invalid revisions.
 * @param opts.id Server-generated proxy UUID.
 * @param opts.revision Positive integer revision for a conditional write. @minimum 1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Server-generated proxy UUID. */
        id: string;
        /** Positive integer revision for a conditional write. @minimum 1 */
        revision?: number;
    },
): Promise<void> {
    if(typeof opts.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.id)||(opts.revision!==undefined&&(!Number.isInteger(opts.revision)||opts.revision<1)))throw Object.assign(new Error('Invalid proxy identity'),{status:400});
}
