/**
 * Import explicitly owner-selected credentials after a confirmed cold boundary.
 *
 * Import explicitly owner-selected credentials after a confirmed cold boundary.
Current live session slot is permanently excluded by bootstrap authority; no default selection.
 * @param opts.ssh Explicit ssh input for this account operation.
 * @param opts.tokens Explicit tokens input for this account operation.
 * @param opts.ownerSelected Explicit ownerSelected input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit ssh input for this account operation. */
        ssh: {instance:string;provider:'codex';account:string};
        /** Explicit tokens input for this account operation. */
        tokens: {access:string;refresh:string;accountId:string;expires:number};
        /** Explicit ownerSelected input for this account operation. */
        ownerSelected: boolean;
    },
): Promise<any> {
    if(opts.ownerSelected!==true)throw Error('Explicit owner account selection required');
     return (ctx as any).fns.codexTunnel.service({}).migrate(opts.ssh,opts.tokens);
}
