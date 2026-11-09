/**
 * Accepts an exact owner-bound transient answer via CSRF-protected HTTP, without reflecting its value.
 * @param opts.req Browser POST request; legacy RPC payloads without a Request are denied.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Browser POST request; legacy RPC payloads without a Request are denied. */
    req?: Request;
}): Promise<Response> {
    const reply = (status: number, error?: string) => Response.json(error ? { error } : { ok: true }, { status, headers: { 'cache-control': 'no-store' } });
    const req = opts.req;
    if (!(req instanceof Request) || req.method !== 'POST') return reply(403, 'HTTP POST required');
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get('x-csrf-token') ?? '' })) return reply(403, 'Invalid CSRF token');
    if (!req.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'JSON required');
    // Bound the stream itself, not merely an untrusted Content-Length header.
    const reader = req.body?.getReader();
    if (!reader) return reply(400, 'Invalid request');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 32768) { await reader.cancel(); return reply(413, 'Request too large'); }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || Object.keys(body).some(k => !['id', 'value', 'cancel'].includes(k)) || (body.cancel !== undefined && typeof body.cancel !== 'boolean')) return reply(400, 'Invalid request');
        if (!await ctx.fns.secureInput.authorize({ req, id: body.id })) return reply(404, 'Prompt unavailable');
        const prompts = (ctx.state as any).secureInput.prompts;
        const prompt = prompts.get(body.id);
        if (!prompt || prompt.expiresAt <= Date.now()) return reply(404, 'Prompt unavailable');
        if (body.cancel === true) {
            prompts.delete(body.id); prompt.reject(new Error('transient input prompt cancelled')); return reply(200);
        }
        if (typeof body.value !== 'string' || !body.value || body.value.length > prompt.maxlength) return reply(400, 'Value is required and must fit the length limit');
        const value = prompt.kind === 'password' ? body.value : body.value.trim();
        if (!value) return reply(400, 'Value is required');
        if (prompt.kind === 'otp' && !/^[0-9 -]{3,16}$/.test(value)) return reply(400, 'Enter the numeric code');
        prompts.delete(body.id);
        prompt.resolve(prompt.kind === 'otp' ? value.replace(/[ -]/g, '') : value);
        return reply(200);
    } catch { return reply(400, 'Unable to accept input'); }
    finally { reader.releaseLock(); }
}
