/**
 * Build dedicated non-multiplexed SSH dynamic-forward arguments with forwarding failure detection.
 *
 * Build dedicated non-multiplexed SSH dynamic-forward arguments with forwarding failure detection.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.connection Explicit connection input for this account operation.
 * @param opts.port port required by sshArgs; supplied by owner-controlled caller.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit connection input for this account operation. */
        connection: {bin:string;args:string[];host:string};
        /** port required by sshArgs; supplied by owner-controlled caller. */
        port: number;
    },
): string[] {
    const connection=opts.connection;
    const port=opts.port;
    if(connection.bin!=='ssh'||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid SSH invocation');const args:string[]=[];for(let i=0;i<connection.args.length;i++){const a=connection.args[i];if(a==='--')continue;if(a==='-o'&&/^Control(Master|Persist|Path)=/.test(connection.args[i+1])){i++;continue}args.push(a)}return [connection.bin,...args,'-o','ControlMaster=no','-o','ControlPath=none','-o','ControlPersist=no','-o','ExitOnForwardFailure=yes','-N','-D',`127.0.0.1:${port}`,'--',connection.host]
}
