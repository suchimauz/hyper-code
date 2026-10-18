import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const transcribe = (await import("./transcribeDictation")).default;
test("bounded transcription rejects empty and oversized input before touching files", async () => {
    for (const audio of [new Uint8Array(), new Uint8Array(8388609)]) {
        await expect(transcribe({} as any, null, { audio })).rejects.toThrow("invalid_audio");
    }
});
const available = !!Bun.which("ffmpeg") && await Bun.file(join(homedir(), ".local/share/whisper-cpp/ggml-small.bin")).exists();
test.skipIf(!available)("real decoder rejects over 60 seconds and invalid data; scratch is cleaned", async () => {
    const dir = await mkdtemp(join(tmpdir(), "whisper-dictation-test-"));
    const ctx: any = { fns: { workspace: { tmp: async ({ path }: any) => join(dir, path) } } };
    try {
        const raw = Buffer.alloc(61 * 32000);
        const h = Buffer.alloc(44);
        h.write("RIFF"); h.writeUInt32LE(36 + raw.length, 4); h.write("WAVEfmt ", 8);
        h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
        h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
        h.write("data", 36); h.writeUInt32LE(raw.length, 40);
        await expect(transcribe(ctx, null, { audio: Buffer.concat([h, raw]) })).rejects.toThrow("audio_too_long");
        expect(await readdir(dir)).toEqual([]);
        await expect(transcribe(ctx, null, { audio: new Uint8Array([1, 2, 3]) })).rejects.toThrow("invalid_audio_or_transcription_failed");
        expect(await readdir(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
});
