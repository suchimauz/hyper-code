/**
 * Validate an allowlisted Codex HTTPS destination and method
 *
 * Use before opening a tunnel. Refuses URL credentials, fragments, non-HTTPS destinations, nonstandard ports and unlisted paths or methods. Query strings are permitted only for model discovery.
 * @param opts.url Absolute HTTPS destination.
 * @param opts.method Exact uppercase HTTP method. @default GET
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Absolute HTTPS destination. */
        url: string;
        /** Exact uppercase HTTP method. @default GET */
        method?: string;
    },
): Promise<{hostname:string;path:string;method:string}> {
    const u=new URL(opts.url); const method=opts.method??'GET';
    const routes:Record<string,string>={'auth.openai.com/oauth/token':'POST','chatgpt.com/backend-api/codex/responses':'POST','chatgpt.com/backend-api/codex/responses/compact':'POST','chatgpt.com/backend-api/codex/models':'GET','chatgpt.com/backend-api/wham/usage':'GET'};
    if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||routes[u.hostname+u.pathname]!==method||(u.search&&u.pathname!=='/backend-api/codex/models'))throw new Error('Codex tunnel destination or method is not allowed');
    return {hostname:u.hostname,path:u.pathname+u.search,method};
}
