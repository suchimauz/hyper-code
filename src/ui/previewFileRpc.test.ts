import { describe, expect, test } from "bun:test";
import previewFile from "../../.mauzcode/ui/previewFile";

// No filesystem, SSH, database or UI writes: all runtime dependencies are mocked.
function fixture(host: string | null = null, privateResult = false) {
    const calls: { name: string; args: any }[] = [];
    const ctx = { fns: {
        files: {
            embedUrl: async (args: any) => { calls.push({ name: "resolve", args }); return { path: "/workspace/docs/readme.md", host, url: "/files/embed/workspace/docs/readme.md" }; },
            isPrivateResult: async (args: any) => { calls.push({ name: "private", args }); return privateResult; },
        },
        canvas: { show: async (args: any) => { calls.push({ name: "canvas", args }); return { id: 42 }; } },
    } } as unknown as Context;
    return { calls, ctx };
}

describe("ui.previewFile native Canvas", () => {
    test("pins local paths and preserves source mode and title", async () => {
        const { ctx, calls } = fixture();
        const result = await previewFile(ctx, null, { path: "docs/readme.md", mode: "source", title: "Read me", maxChars: 10 });
        expect(result).toMatchObject({ itemId: 42, host: null, mode: "source", path: "/workspace/docs/readme.md" });
        expect(calls).toEqual([
            { name: "resolve", args: { path: "docs/readme.md", host: undefined, mode: "source" } },
            { name: "private", args: { path: "/workspace/docs/readme.md", host: undefined } },
            { name: "canvas", args: { kind: "file", args: { path: "/workspace/docs/readme.md", host: "local", mode: "source" }, title: "Read me" } },
        ]);
    });
    test("pins inherited remote workspace and explicit remote host", async () => {
        for (const host of [undefined, "ssh-host"]) {
            const f = fixture("ssh-host");
            await previewFile(f.ctx, null, { path: "docs/readme.md", host, mode: "preview" });
            expect(f.calls[0].args.host).toBe(host);
            expect(f.calls[2].args).toEqual({ kind: "file", args: { path: "/workspace/docs/readme.md", host: "ssh-host", mode: "preview" }, title: "ssh-host:/workspace/docs/readme.md" });
        }
    });
    test("rejects private results before showing any Canvas tab", async () => {
        const f = fixture(null, true);
        await expect(previewFile(f.ctx, null, { path: "alias-to-private-result" })).rejects.toThrow("file not found");
        expect(f.calls.map(c => c.name)).toEqual(["resolve", "private"]);
    });
    test("generic RPC fails explicitly before resolving or exposing any file", async () => {
        const f = fixture();
        const result = await previewFile(f.ctx, { url: new URL("http://localhost/rpc") } as Session, { path: "/another-user/file" });
        expect(result).toBeInstanceOf(Response);
        expect((result as Response).status).toBe(403);
        expect(await (result as Response).text()).toContain("Canvas");
        expect(f.calls).toEqual([]);
    });
});
