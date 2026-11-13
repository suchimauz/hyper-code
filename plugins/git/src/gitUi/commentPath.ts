/**
 * Validate a saved comment path without accessing the working tree
 *
 * Use for stored anchors and list filters even when a file was removed, became a directory, or has a symlink ancestor. Filesystem safety remains the responsibility of diff readers.
 * @param opts.path Repository-relative path with no traversal or Git metadata components.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Repository-relative path with no traversal or Git metadata components. */
        path: string;
    },
): Promise<void> {
    if(typeof opts.path!=='string'||!opts.path||opts.path.length>4096||opts.path.includes('\0')||opts.path.includes('�')||opts.path.startsWith('/')||opts.path.split('/').some(p=>!p||p==='..'||p==='.'||p==='.git'))throw new Error('Invalid repository path');
}
