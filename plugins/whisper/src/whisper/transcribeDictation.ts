/**
 * Transcribes bounded microphone audio locally using the small Russian Whisper model.
 *
 * Use for authenticated microphone dictation after HTTP upload validation. Accepts at most 8 MiB, decodes at most 60 seconds plus one sample to detect excess duration, and kills conversion after 15 seconds and recognition after 120 seconds. Temporary files stay in workspace scratch and are always removed. Never dispatches or executes recognized text.
 * @param opts.audio Raw browser audio bytes; must be nonempty and at most 8 MiB.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw browser audio bytes; must be nonempty and at most 8 MiB. */
        audio: Uint8Array;
    },
): Promise<{ text: string; model: string; language: string; audioSec: number; convertMs: number; whisperMs: number }> {
    const { homedir } = await import("node:os");
    const { rm } = await import("node:fs/promises");
    if (!opts.audio.byteLength || opts.audio.byteLength > 8 * 1024 * 1024) throw new Error("invalid_audio");
    const modelPath = homedir() + "/.local/share/whisper-cpp/ggml-small.bin";
    if (!(await Bun.file(modelPath).exists())) throw new Error("model_unavailable");
    const base = await ctx.fns.workspace.tmp({ path: "dictation-" + Bun.randomUUIDv7() });
    const input = base + ".audio", pcm = base + ".pcm", wav = base + ".wav", output = base + ".txt";
    const run = async (args: string[], timeoutMs: number) => {
        const child = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
        try {
            const code = await child.exited;
            if (timedOut) throw new Error("transcription_timeout");
            if (code !== 0) throw new Error("invalid_audio_or_transcription_failed");
        } finally { clearTimeout(timer); }
    };
    try {
        await Bun.write(input, opts.audio);
        const start = performance.now();
        // Decode only local file/pipe protocols: containers must not fetch playlists or URLs.
        await run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", "matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,ogg,wav", "-i", input,
            "-map", "0:a:0", "-vn", "-t", "60.000063", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "s16le", pcm], 15000);
        const raw = new Uint8Array(await Bun.file(pcm).arrayBuffer());
        if (raw.length > 60 * 32000) throw new Error("audio_too_long");
        if (!raw.length) throw new Error("invalid_audio");
        const header = Buffer.alloc(44);
        header.write("RIFF", 0); header.writeUInt32LE(36 + raw.length, 4); header.write("WAVEfmt ", 8);
        header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
        header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(raw.length, 40);
        await Bun.write(wav, Buffer.concat([header, raw]));
        const convertMs = Math.round(performance.now() - start);
        const recognitionStart = performance.now();
        await run(["whisper-cli", "-m", modelPath, "-l", "ru", "-nt", "-np", "-f", wav, "-otxt", "-of", base], 120000);
        const file = Bun.file(output);
        if (file.size > 65536) throw new Error("transcription_failed");
        const text = (await file.text()).trim().replace(/\s*\n\s*/g, " ");
        return { text, model: "small", language: "ru", audioSec: raw.length / 32000, convertMs, whisperMs: Math.round(performance.now() - recognitionStart) };
    } finally {
        await Promise.all([input, pcm, wav, output].map(path => rm(path, { force: true })));
    }
}
