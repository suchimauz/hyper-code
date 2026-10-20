/**
 * Updates an existing SSH endpoint while preserving its login identity
 *
 * Use to edit a host, user or port without renaming the instance. Changed endpoints lose host trust and connected account status, and receive a fresh socket namespace with the same private identity.
 * @param opts.name Existing stable instance name.
 * @param opts.host Validated literal destination hostname or IP.
 * @param opts.user Remote login account.
 * @param opts.port SSH TCP port. @default 22 @minimum 1 @maximum 65535
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing stable instance name. */
        name: string;
        /** Validated literal destination hostname or IP. */
        host: string;
        /** Remote login account. */
        user: string;
        /** SSH TCP port. @default 22 @minimum 1 @maximum 65535 */
        port?: number;
    },
): Promise<types.sshInstance.Instance> {
    await ctx.fns.sshInstance.authorize({}); const endpoint=await ctx.fns.sshInstance.validate(opts); const old=await ctx.fns.sshInstance.get({name:opts.name});
    if(old.host===endpoint.host && old.port===endpoint.port && old.user===endpoint.user) return old;
    return (await ctx.fns.sshInstance.replaceDescriptor({previous:old,next:{...old,...endpoint,pinnedHostKey:null}}))!;
}
