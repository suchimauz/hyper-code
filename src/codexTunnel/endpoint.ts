/**
 * Allow only exact Codex HTTPS inference, compact, model, usage and OAuth refresh endpoints.
 *
 * Allow only exact Codex HTTPS inference, compact, model, usage and OAuth refresh endpoints.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.raw Explicit raw input for this account operation.
 * @param opts.method method required by endpoint; supplied by owner-controlled caller.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit raw input for this account operation. */
        raw: string;
        /** method required by endpoint; supplied by owner-controlled caller. */
        method: string;
    },
): boolean {
    const raw=opts.raw;
    const method=opts.method;
    const u=new URL(raw);if(u.username||u.password||u.hash||u.port)throw Error('Endpoint refused');const fixed=new Map([['https://auth.openai.com/oauth/token','POST'],['https://chatgpt.com/backend-api/codex/responses','POST'],['https://chatgpt.com/backend-api/codex/responses/compact','POST'],['https://chatgpt.com/backend-api/codex/models','GET'],['https://chatgpt.com/backend-api/wham/usage','GET']]);if(fixed.get(u.origin+u.pathname)!==method)throw Error('Endpoint refused');if(u.search&&(u.pathname!=='/backend-api/codex/models'||[...u.searchParams].length!==1||!/^[-\w.]{1,80}$/.test(u.searchParams.get('client_version')??'')))throw Error('Query refused');return true;
}
