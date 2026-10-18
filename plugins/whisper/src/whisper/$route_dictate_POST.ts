/** POST /whisper/dictate — authenticated, CSRF-protected raw microphone audio to local Russian text only. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const req = opts.req;
    const reply = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
    const max = 8 * 1024 * 1024;
    // Kept on context state so hot reload cannot permit overlapping CPU jobs.
    const state = ctx.state as typeof ctx.state & { whisperDictationBusy?: boolean };
    let ownsLock = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const identity = await ctx.fns.auth.currentUser({ req });
        if (!identity.user) return reply(401, "authentication_required");
        if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("X-CSRF-Token") ?? "" })) return reply(403, "invalid_csrf");
        const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
        if (!["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave"].includes(type)) return reply(415, "unsupported_audio_type");
        const length = req.headers.get("content-length");
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) return reply(413, "audio_too_large");
        if (!req.body) return reply(400, "invalid_audio");
        if (state.whisperDictationBusy) return reply(429, "dictation_busy");
        state.whisperDictationBusy = true;
        ownsLock = true;
        reader = req.body.getReader();
        let timedOut = false;
        timer = setTimeout(() => { timedOut = true; void reader?.cancel().catch(() => undefined); }, 15000);
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const part = await reader.read();
            if (timedOut) return reply(408, "upload_timeout");
            if (part.done) break;
            size += part.value.byteLength;
            if (size > max) { await reader.cancel(); return reply(413, "audio_too_large"); }
            chunks.push(part.value);
        }
        clearTimeout(timer);
        if (!size) return reply(400, "invalid_audio");
        const audio = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
        const result = await ctx.fns.whisper.transcribe({ audio, model: "small", language: "ru", dictation: true });
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "audio_too_long") return reply(422, code);
        if (code === "transcription_timeout") return reply(504, code);
        if (code === "model_unavailable") return reply(503, code);
        return reply(400, "dictation_failed");
    } finally {
        if (timer) clearTimeout(timer);
        reader?.releaseLock();
        if (ownsLock) state.whisperDictationBusy = false;
    }
}
