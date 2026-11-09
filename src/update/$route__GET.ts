/** Redirects update administration to the native React utility page. */
export default async function (_ctx: Context, session: Session | null, _opts: { /** Incoming request. */ req: Request; /** Route parameters. */ params: Record<string, string> }) {
    if (session?.user?.role !== 'owner') return new Response('Owners only', { status: 403 });
    return new Response(null, { status: 302, headers: { Location: '/?view=extension:utilities/update', 'Cache-Control': 'no-store' } });
}
