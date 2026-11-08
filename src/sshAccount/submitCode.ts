/**
 * Forward a verified Claude loopback callback privately over pinned SSH.
 *
 * Use only from the owner login popup. Validate against the pending CLI authorization
 * URL, then send a reconstructed loopback request through private stdin. Never log,
 * persist or return the callback. HTTP success alone never marks the account connected.
 * @param opts.id Opaque identifier returned by startLogin.
 * @param opts.code Full browser callback URL, held only for this request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque identifier returned by startLogin. */
        id: string;
        /** Full browser callback URL; never logged or persisted. */
        code: string;
    },
): Promise<{ok:true}> {
    await ctx.fns.sshAccount.requireOwner({});
    const f = ctx.state.sshAccount?.flows?.get(opts.id);
    const pending = () => f && f.provider === 'claude-code' && f.status === 'pending' && f.process && Date.now() < f.expiresAt;
    if (!pending()) throw new Error('Authorization not pending');
    if (!f!.callbackConnection) throw new Error('Start a new login to enable secure callback delivery.');
    if (f!.callbackSubmission) throw new Error('Callback already submitted. Refresh status; if login does not finish, cancel and start again.');
    // Reject ambiguous URL syntax before WHATWG normalization, including encoded paths,
    // userinfo, fragments, control characters and backslashes.
    const loopback = (value: string, query: boolean) => {
        const match = /^http:\/\/(localhost|127\.0\.0\.1):([1-9][0-9]{3,4})\/callback(\?[^#\s\\]*)?$/.exec(value);
        if (!match || Number(match[2]) < 1024 || Number(match[2]) > 65535 || (!query && match[3])) throw new Error('Invalid callback URL. Use the full localhost callback address from this login.');
        return new URL(value);
    };
    let target: string;
    try {
        if (typeof opts.code !== 'string' || opts.code.length > 8192 || /[\x00-\x20\x7f]/.test(opts.code)) throw new Error();
        const auth = new URL(f!.verificationUri ?? '');
        if (auth.protocol !== 'https:' || auth.username || auth.password || auth.hash || auth.port || !['claude.com','claude.ai','console.anthropic.com','platform.claude.com'].includes(auth.hostname) || !auth.pathname.endsWith('/oauth/authorize')) throw new Error();
        if (auth.searchParams.getAll('state').length !== 1 || auth.searchParams.getAll('redirect_uri').length !== 1) throw new Error();
        const expectedState = auth.searchParams.get('state');
        if (!expectedState) throw new Error();
        const redirect = loopback(auth.searchParams.get('redirect_uri')!, false);
        const callback = loopback(opts.code, true);
        if (callback.port !== redirect.port || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.get('state') !== expectedState || callback.searchParams.getAll('code').length !== 1) throw new Error();
        for (const key of callback.searchParams.keys()) if (key !== 'code' && key !== 'state') throw new Error();
        const code = callback.searchParams.get('code');
        if (!code || code.length > 4096 || /[\x00-\x20\x7f]/.test(code) || /[\x00-\x20\x7f]/.test(expectedState)) throw new Error();
        target = `http://127.0.0.1:${redirect.port}/callback?${new URLSearchParams({code,state:expectedState})}`;
    } catch {
        throw new Error('Invalid callback URL. Copy the full localhost callback address from this login; its state and port must match.');
    }
    // Acquire synchronously before any await. Only pre-transport failures permit retry;
    // once a helper starts, its outcome can be ambiguous even after an HTTP error.
    f!.callbackSubmission = 'sending';
    let started = false;
    try {
        const currentConnection = await ctx.fns.sshInstance.connection({name:f!.instance});
        const connection = f!.callbackConnection!;
        if (JSON.stringify(currentConnection) !== JSON.stringify(connection)) throw new Error('SSH destination changed');
        if (!pending()) throw new Error('Authorization not pending');
        const process = Bun.spawn([connection.bin,...connection.args,connection.host,
            "env -i PATH=/usr/bin:/bin curl --silent --noproxy '*' --connect-timeout 3 --max-time 12 --max-redirs 0 --proto '=http' --output /dev/null --config -"],
            {stdin:'pipe',stdout:'ignore',stderr:'ignore'});
        started = true;
        const timer = setTimeout(() => process.kill(), 15000);
        const cancelled = setInterval(() => { if (!pending()) process.kill(); }, 250);
        try {
            process.stdin.write(`url = ${JSON.stringify(target)}\n`);
            await process.stdin.flush();
            process.stdin.end();
            const exit = await process.exited;
            f!.callbackSubmission = exit === 0 ? 'sent' : 'uncertain';
            if (exit !== 0) throw new Error('Callback delivery could not be confirmed');
        } finally { clearTimeout(timer); clearInterval(cancelled); if (f!.callbackSubmission === 'sending') process.kill(); }
        return {ok:true};
    } catch {
        if (!started) delete f!.callbackSubmission;
        else f!.callbackSubmission = 'uncertain';
        throw new Error(started
            ? 'Callback delivery is uncertain. Refresh status; if login does not finish, cancel and start again. Do not submit the callback again.'
            : 'Callback was not sent. Check that this login is still pending and the SSH connection is available.');
    }
}
