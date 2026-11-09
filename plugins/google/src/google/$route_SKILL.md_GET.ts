import { resolve } from "node:path";

/** Serve the original Google skill as Markdown, without a second HTML document UI. */
export default async function (_ctx: Context, _session: Session | null, _opts?: {}): Promise<Response> {
    return new Response(await Bun.file(resolve(import.meta.dir, "../../SKILL.md")).text(), {
        headers: { "content-type": "text/markdown; charset=utf-8", "x-content-type-options": "nosniff" },
    });
}
