import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("GET /files — media preview", () => {
    test("renders png through the raw media endpoint without decoding it as text", async () => {
        const ctx = await mkTestCtx();
        const dir = await mkdtemp(join(tmpdir(), "hyper-media-"));
        const path = join(dir, "sample.png");
        const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        await writeFile(path, bytes);
        try {
            const page = await ctx.fns.procs.http.dispatch({ url: `/files?format=json&path=${encodeURIComponent(path)}` });
            expect(page.status).toBe(200);
            expect(await page.json()).toMatchObject({preview:true,previewKind:'image'});

            const raw = await ctx.fns.procs.http.dispatch({ url: `/files/raw?path=${encodeURIComponent(path)}` });
            expect(raw.status).toBe(200);
            expect(raw.headers.get("content-type")).toBe("image/png");
            expect(new Uint8Array(await raw.arrayBuffer())).toEqual(bytes);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("uses native preview elements for video, audio and pdf", async () => {
        const ctx = await mkTestCtx();
        const dir = await mkdtemp(join(tmpdir(), "hyper-media-"));
        try {
            for (const [file, previewKind] of [["clip.mp4", "video"], ["sound.mp3", "audio"], ["paper.pdf", "pdf"]] as const) {
                const path = join(dir, file);
                await writeFile(path, new Uint8Array([0]));
                const data = await (await ctx.fns.procs.http.dispatch({ url: `/files?format=json&path=${encodeURIComponent(path)}` })).json();
                expect(data).toMatchObject({path,preview:true,previewKind});
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
