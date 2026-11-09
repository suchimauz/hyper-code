/** Redirect legacy personal project archive links to the native React archive filter. Authorized navigation reads and restore actions remain in the React API. */
export default async function(ctx: Context, session: Session | null, opts: {
 /** Incoming archive navigation request. */ req: Request;
}): Promise<Response> {
 return new Response(null, {status:302, headers:{Location:'/?workspaceFilter=archived', 'Cache-Control':'no-store'}});
}
