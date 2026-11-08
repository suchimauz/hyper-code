/**
 * Claim the shared local worker mutation domain without check-then-act.
 *
 * Claim the shared local worker mutation domain without check-then-act.
Existing or abandoned claim fails closed. Never delete another worker's claim.
 * @param opts.directory Explicit directory input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit directory input for this account operation. */
        directory: string;
    },
): Promise<() => Promise<void>> {
    const fs=await import('node:fs/promises');const path=await import('node:path');
     if(!path.isAbsolute(opts.directory))throw Error('Absolute lock directory required');
     const info=await fs.lstat(opts.directory);
     if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.uid!==process.getuid?.())throw Error('Unsafe mutation lock directory');
     const target=path.join(opts.directory,'owner-mutation.lock');
     await fs.mkdir(target,{mode:0o700});let released=false;
     return async()=>{if(released)return;await fs.rmdir(target);released=true};
}
