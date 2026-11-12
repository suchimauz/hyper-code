import { realpath, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_BYTES = 1024 * 1024;

/**
 * Renders one OpenSpec artifact of a local workspace as sanitized HTML for the read-only OpenSpec Canvas tab.
 *
 * Accepts only opaque ids produced by `openspec.snapshot` — `change:<name>:proposal|design|tasks`,
 * `change:<name>:spec:<capability-path>`, the same with `archive:` for archived changes, and `spec:<capability-path>` —
 * never file paths. Every segment is validated (no `..`), and the resolved real path must stay inside
 * `realpath(<dir>/.mauzcode/openspec)`, so symlink escapes are rejected. Files over 1 MB are refused. Renders with
 * `markdown.render` and `agent.sanitizeHtmlBody`; writes nothing.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Absolute local workspace directory whose `.mauzcode/openspec` folder is read. */
    dir: string;
    /** Opaque artifact id from `openspec.snapshot`, e.g. `change:add-login:proposal` or `spec:user-auth`. */
    id: string;
}): Promise<{ id: string; title: string; html: string; mtime: number }> {
    if (typeof opts.dir !== 'string' || !path.isAbsolute(opts.dir) || opts.dir.includes('\0')) throw new Error('openspec.document: an absolute workspace directory is required');
    if (typeof opts.id !== 'string' || opts.id.length > 600) throw new Error('openspec.document: invalid document id');
    const parts = opts.id.split(':');
    const segments = (p: string) => { const s = p.split('/'); if (!s.length || s.length > 5 || !s.every(x => SEGMENT.test(x) && x !== '..' && x !== '.')) throw new Error('openspec.document: invalid document id'); return s; };
    let rel: string[];
    if (parts[0] === 'spec' && parts.length === 2) rel = ['specs', ...segments(parts[1]!), 'spec.md'];
    else if ((parts[0] === 'change' || parts[0] === 'archive') && parts.length >= 3) {
        const [name] = segments(parts[1]!);
        if (parts[1]!.includes('/') || (parts[0] === 'change' && name === 'archive')) throw new Error('openspec.document: invalid document id');
        const base = parts[0] === 'change' ? ['changes', name!] : ['changes', 'archive', name!];
        if (parts.length === 3 && ['proposal', 'design', 'tasks'].includes(parts[2]!)) rel = [...base, parts[2] + '.md'];
        else if (parts.length === 4 && parts[2] === 'spec') rel = [...base, 'specs', ...segments(parts[3]!), 'spec.md'];
        else throw new Error('openspec.document: invalid document id');
    } else throw new Error('openspec.document: invalid document id');

    const root = await realpath(path.join(opts.dir, '.mauzcode', 'openspec')).catch(() => null);
    if (!root) throw new Error('openspec.document: OpenSpec is not initialized in this workspace');
    const real = await realpath(path.join(root, ...rel)).catch(() => null);
    if (!real) throw new Error('openspec.document: document not found');
    if (!real.startsWith(root + path.sep)) throw new Error('openspec.document: document is outside the OpenSpec folder');
    const info = await stat(real);
    if (!info.isFile()) throw new Error('openspec.document: document not found');
    if (info.size > MAX_BYTES) throw new Error('openspec.document: document is larger than 1 MB');
    const source = await readFile(real, 'utf8');
    const html = ctx.fns.agent.sanitizeHtmlBody({ html: await ctx.fns.markdown.render({ source }) });
    const title = rel.slice(rel[0] === 'specs' ? 1 : rel[1] === 'archive' ? 2 : 1).join('/');
    return { id: opts.id, title, html, mtime: info.mtimeMs };
}
