/**
 * Prove a Linux loopback listening socket inode belongs to the expected tunnel child, not a competitor.
 *
 * Prove a Linux loopback listening socket inode belongs to the expected tunnel child, not a competitor.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.pid Explicit pid input for this account operation.
 * @param opts.port port required by ownsListener; supplied by owner-controlled caller.
 * @param opts.io io required by ownsListener; supplied by owner-controlled caller.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit pid input for this account operation. */
        pid: number;
        /** port required by ownsListener; supplied by owner-controlled caller. */
        port: number;
        /** io required by ownsListener; supplied by owner-controlled caller. */
        io: {readFile:(p:string,e:'utf8')=>Promise<string>;readdir:(p:string)=>Promise<string[]>;readlink:(p:string)=>Promise<string>};
    },
): Promise<boolean> {
    const pid=opts.pid;
    const port=opts.port;
    const io=opts.io;
    const base=`/proc/${pid}`;const table=await io.readFile(base+'/net/tcp','utf8');const inodes=new Set(table.trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(c=>c[1]===`0100007F:${port.toString(16).toUpperCase().padStart(4,'0')}`&&c[3]==='0A').map(c=>c[9]));for(const fd of await io.readdir(base+'/fd')){try{const link=await io.readlink(base+'/fd/'+fd);if(inodes.has(link.match(/^socket:\[(\d+)\]$/)?.[1]??''))return true}catch{/* process may close an fd between listing and readlink */}}return false;
}
