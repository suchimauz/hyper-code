/** Redirect legacy LLM connection visits to the native React settings panel without provider probes. */
export default async function (_ctx: Context, _session: Session | null, _opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Captured route parameters. */ params: Record<string, string>;
}) {
    return new Response(null, { status: 303, headers: { Location: '/?settings=llm-connections', 'Cache-Control': 'no-store' } });
}
