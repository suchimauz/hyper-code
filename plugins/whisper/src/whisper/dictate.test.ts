import { expect, test } from "bun:test";

// Isolated route: no runtime DB, auth sessions, model, or subprocesses.
const route = (await import("./$route_dictate_POST")).default;
function fixture() {
    const calls: any[] = [];
    const ctx: any = { state: {}, fns: { auth: {
        currentUser: async () => ({ user: { id: "test" }, required: true }),
        verifyCsrf: async ({ token }: any) => token === "valid",
    }, whisper: { transcribe: async (opts: any) => { calls.push(opts); return { text: "открой терминал", model: "small", language: "ru" }; } } } };
    const request = (body: BodyInit = new Uint8Array([1]), headers: Record<string, string> = {}) => new Request("http://local/whisper/dictate?model=large&language=en", { method: "POST", body, headers: { "content-type": "audio/webm;codecs=opus", "X-CSRF-Token": "valid", ...headers } });
    const run = (req: Request) => route(ctx, null, { req, params: {} });
    return { ctx, calls, request, run };
}
test("anonymous open-mode requests and invalid CSRF are rejected before transcription", async () => {
    const f = fixture();
    f.ctx.fns.auth.currentUser = async () => ({ user: null, required: false });
    expect((await f.run(f.request())).status).toBe(401);
    f.ctx.fns.auth.currentUser = async () => ({ user: { id: "u" } });
    expect((await f.run(f.request(undefined, { "X-CSRF-Token": "bad" }))).status).toBe(403);
    expect(f.calls).toHaveLength(0);
});
test("only supported audio; empty and oversized bodies rejected including streaming without length", async () => {
    const f = fixture();
    expect((await f.run(f.request(undefined, { "content-type": "text/html" }))).status).toBe(415);
    expect((await f.run(f.request(new Uint8Array()))).status).toBe(400);
    expect((await f.run(f.request(undefined, { "content-length": "8388609" }))).status).toBe(413);
    let cancelled = false;
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8 * 1024 * 1024)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    expect((await f.run(f.request(stream))).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(f.calls).toHaveLength(0);
});
test("returns text only, fixed small/ru bounded mode, supported browser types", async () => {
    const f = fixture();
    for (const type of ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]) {
        const response = await f.run(f.request(undefined, { "content-type": type }));
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect((await response.json()).text).toBe("открой терминал");
    }
    expect(f.calls[0]).toMatchObject({ model: "small", language: "ru", dictation: true });
});
test("serial busy guard and release after failure; internal errors never leak", async () => {
    const f = fixture();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(r => started = r);
    f.ctx.fns.whisper.transcribe = async () => { started(); await new Promise<void>(r => release = r); throw new Error("secret /home/private/token"); };
    const first = f.run(f.request());
    await entered;
    expect((await f.run(f.request())).status).toBe(429);
    release();
    const failed = await first;
    expect(await failed.json()).toEqual({ error: "dictation_failed" });
    expect(f.ctx.state.whisperDictationBusy).toBe(false);
});
test("bounded helper failures map to stable public errors", async () => {
    const f = fixture();
    for (const [error, status] of [["audio_too_long", 422], ["transcription_timeout", 504], ["model_unavailable", 503]] as const) {
        f.ctx.fns.whisper.transcribe = async () => { throw new Error(error); };
        expect((await f.run(f.request())).status).toBe(status);
        expect(f.ctx.state.whisperDictationBusy).toBe(false);
    }
});
