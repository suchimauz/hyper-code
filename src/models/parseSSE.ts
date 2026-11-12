/**
 * Split a Server-Sent-Events byte stream into frames
 *
 * SDK-owned SSE framing for provider streams: yields { event, data } per blank-line-delimited frame (multi-line data joined by newline, one leading space stripped, comment/keepalive frames skipped, CRLF accepted). An unterminated trailing frame is dropped as truncated. Throws when no chunk arrives within idleTimeoutMs. Callers JSON-parse and dispatch themselves.
 * @param opts.body Response byte stream.
 * @param opts.idleTimeoutMs Maximum wait between chunks in milliseconds. @default 120000 @minimum 1
 */
export default async function* (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Response byte stream. */
        body: ReadableStream<Uint8Array>;
        /** Maximum wait between chunks in milliseconds. @default 120000 @minimum 1 */
        idleTimeoutMs?: number;
    },
): AsyncGenerator<{ event: string | null; data: string }> {
    const idleMs = opts.idleTimeoutMs ?? 120000;
    const reader = opts.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const frame = (raw: string) => {
        let event: string | null = null;
        const data: string[] = [];
        for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        return data.length ? { event, data: data.join("\n") } : null;
    };
    try {
        while (true) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const stall = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`stream stalled — no data for ${Math.round(idleMs / 1000)}s`)), idleMs); });
            let chunk: Awaited<ReturnType<typeof reader.read>>;
            try { chunk = await Promise.race([reader.read(), stall]); } finally { clearTimeout(timer); }
            if (chunk.done) break;
            buf += decoder.decode(chunk.value, { stream: true }).replace(/\r\n?/g, "\n");
            let idx: number;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
                const f = frame(buf.slice(0, idx));
                buf = buf.slice(idx + 2);
                if (f) yield f;
            }
        }
    } finally {
        try { await reader.cancel(); } catch { /* the original stream error wins */ }
        reader.releaseLock();
    }
}
