/**
 * Read bounded file metadata, editable text or directory entries for the native Files page
 *
 * Use after HTTP authentication and path/host validation to provide native React file previews. Private tool results are never exposed. Binary and large files are preview-only.
 * @param opts.path Validated absolute or workspace-relative file path.
 * @param opts.host Validated SSH alias; omitted for local files.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Validated absolute or workspace-relative file path. */
        path: string;
        /** Validated SSH alias; omitted for local files. */
        host?: string;
    },
): Promise<Response> {
    if (await ctx.fns.files.isPrivateResult(opts)) return new Response('File unavailable', {status:404});
    const info = await ctx.fns.files.stat(opts);
    if (!info) return new Response('File unavailable', {status:404});
    const path = opts.host ? opts.path : ctx.fns.files.resolveSafe({path:opts.path});
    if (info.isDir) {
        const entries = [];
        for (const entry of await ctx.fns.files.list(opts)) {
            const child = path.replace(/\/$/, '') + '/' + entry.name;
            if (!await ctx.fns.files.isPrivateResult({path:child,host:opts.host})) entries.push(entry);
        }
        return Response.json({path,isDir:true,entries});
    }
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    const previewKind = /^(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(extension) ? 'image' : /^(mp4|webm|mov|m4v|ogv)$/.test(extension) ? 'video' : /^(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/.test(extension) ? 'audio' : extension === 'pdf' ? 'pdf' : /^(html?)$/.test(extension) ? 'html' : /^(md|markdown)$/.test(extension) ? 'markdown' : 'text';
    if (['image','video','audio','pdf'].includes(previewKind) || info.size > 1024*1024) return Response.json({path,preview:true,previewKind:['text','markdown','html'].includes(previewKind)?'download':previewKind,size:info.size});
    const content=await ctx.fns.files.read(opts);
    if(content.includes('\u0000')) return Response.json({path,preview:true,previewKind:'download',size:info.size});
    return Response.json({path,content,previewKind});
}
