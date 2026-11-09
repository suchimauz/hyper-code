/** Redirects the prose-completion lab to its native React utility page. */
export default async function (_ctx: Context, _session: Session | null, _opts: { /** Incoming request. */ req: Request; /** Route parameters. */ params: Record<string, string> }) {
    return new Response(null, { status: 302, headers: { Location: '/?view=extension:utilities/autotext', 'Cache-Control': 'no-store' } });
}
