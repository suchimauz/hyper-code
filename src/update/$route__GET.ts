/** Redirects legacy update administration to the Updates tab of the Settings dialog. */
export default async function (_ctx: Context, session: Session | null, _opts: { /** Incoming request. */ req: Request; /** Route parameters. */ params: Record<string, string> }) {
    if (session?.user?.role !== 'owner') return new Response('Owners only', { status: 403 });
    return new Response(null, { status: 302, headers: { Location: '/?settings=updates', 'Cache-Control': 'no-store' } });
}
