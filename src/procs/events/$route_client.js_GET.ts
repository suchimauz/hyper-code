// The browser half of the event stream.
//
// The text import inlines the file at BUILD time, which is what makes a
// production bundle self-contained — but in dev it also freezes the script at
// the moment this module was first imported. Editing client.js then changed
// nothing in the browser: the server kept serving the old snapshot, and hours
// went into chasing a bug that had already been fixed. So in dev the file is
// read from disk, and the inlined copy is the fallback a bundle uses.
import clientJs from "./client.js" with { type: "text" };
import { resolve } from "node:path";

const PATH = resolve(import.meta.dir, "client.js");

/**
 * Handle the GET request for the events route.
 * @param opts.req The incoming HTTP request; its If-None-Match is answered with 304 when the client is unchanged.
 */
export default async function (ctx: Context, _session: Session, opts: { req: Request }) {
    const file = Bun.file(PATH);
    const body = ctx.env.NODE_ENV === "production" || !(await file.exists())
        ? (clientJs as unknown as string)
        : await file.text();
    // no-cache revalidates every load; an unchanged client answers 304 instead of the whole script.
    const etag = `"${Bun.hash(body).toString(36)}"`;
    const headers = { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", etag };
    if (opts?.req?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(body, { headers });
}
