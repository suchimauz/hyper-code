/** Redirect owner-only SSH setup visits to the native React settings panel. */
export default async function (_ctx: Context, session: Session | null, _opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Captured route parameters. */ params: Record<string, string>;
}) {
    if (session?.user?.role !== 'owner') return new Response('Only owners can manage SSH instances', { status: 403 });
    return new Response(null, { status: 303, headers: { Location: '/?settings=ssh-instances', 'Cache-Control': 'no-store' } });
}
