/** Serve the bundled symbols-only Nerd Font used by the Canvas Terminal for prompt icons (owner session required). */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming font request. */ req: Request;
    /** HTTP route parameters (unused). */ params: Record<string, string>;
}): Promise<Response> {
    if (!session?.user) return new Response('Authentication required', {status: 401});
    const path = await import('node:path');
    const file = Bun.file(path.join(import.meta.dir, '../../assets/SymbolsNerdFontMono-Regular.ttf'));
    if (!(await file.exists())) return new Response('Font not found', {status: 404});
    return new Response(file, {headers: {'content-type': 'font/ttf', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff'}});
}
