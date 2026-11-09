/** Redirect the legacy instance directory to its native React extension page. */
export default async function (_ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return new Response(null, { status: 302, headers: { Location: '/?view=extension:instances/overview', 'Cache-Control': 'no-store' } });
}
