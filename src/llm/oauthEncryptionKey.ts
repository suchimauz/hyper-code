/**
 * Load and validate the OAuth credential encryption key.
 *
 * Legacy name for secrets.localEncryptionKey; returns the same key.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<Uint8Array> {
    return ctx.fns.secrets.localEncryptionKey({});
}
