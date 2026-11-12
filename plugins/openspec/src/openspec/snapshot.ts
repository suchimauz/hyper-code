import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

type Artifact = { id: string; label: string };
type Change = { name: string; progress: { done: number; total: number } | null; artifacts: Artifact[]; mtime: number };

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Lists the OpenSpec state of a local workspace for the read-only OpenSpec Canvas tab.
 *
 * Reads `<dir>/.mauzcode/openspec` directly with the file system (no CLI spawn, no writes): active changes with
 * `tasks.md` checkbox progress and the ids of the artifacts that exist (proposal, design, tasks, each spec delta by
 * capability path), current specs by capability path, and archived changes newest first. Artifact ids are opaque
 * strings accepted by `openspec.document`. An uninitialized workspace returns `initialized: false` and is left unchanged.
 */
export default async function (_ctx: Context, _session: Session | null, opts: {
    /** Absolute local workspace directory whose `.mauzcode/openspec` folder is read. */
    dir: string;
}): Promise<{
    initialized: boolean;
    key: string;
    changes: Change[];
    specs: { id: string; path: string }[];
    archive: Change[];
}> {
    if (typeof opts.dir !== 'string' || !path.isAbsolute(opts.dir) || opts.dir.includes('\0')) throw new Error('openspec.snapshot: an absolute workspace directory is required');
    const root = path.join(opts.dir, '.mauzcode', 'openspec');
    const key = new Bun.CryptoHasher('sha256').update(path.resolve(opts.dir)).digest('hex').slice(0, 16);
    const isDir = async (p: string) => (await stat(p).catch(() => null))?.isDirectory() ?? false;
    const isFile = async (p: string) => (await stat(p).catch(() => null))?.isFile() ?? false;
    const dirs = async (p: string) => (await readdir(p, { withFileTypes: true }).catch(() => []))
        .filter(e => e.isDirectory() && SEGMENT.test(e.name)).map(e => e.name).sort();
    if (!(await isDir(root))) return { initialized: false, key, changes: [], specs: [], archive: [] };

    // Capability paths: nested folders containing spec.md, relative to base, joined by '/'.
    async function capabilities(base: string, prefix = '', depth = 0): Promise<string[]> {
        const out: string[] = [];
        for (const name of await dirs(path.join(base, prefix))) {
            const rel = prefix ? prefix + '/' + name : name;
            if (await isFile(path.join(base, rel, 'spec.md'))) out.push(rel);
            if (depth < 4) out.push(...await capabilities(base, rel, depth + 1));
        }
        return out;
    }
    async function change(kind: 'change' | 'archive', dir: string, name: string): Promise<Change> {
        const artifacts: Artifact[] = [];
        let progress: Change['progress'] = null;
        for (const doc of ['proposal', 'design', 'tasks'] as const) {
            const file = path.join(dir, doc + '.md');
            if (!(await isFile(file))) continue;
            artifacts.push({ id: `${kind}:${name}:${doc}`, label: doc + '.md' });
            if (doc === 'tasks') {
                const text = await readFile(file, 'utf8');
                const total = (text.match(/^\s*[-*] \[[ xX]\]/gm) ?? []).length;
                const done = (text.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length;
                progress = { done, total };
            }
        }
        for (const cap of await capabilities(path.join(dir, 'specs'))) artifacts.push({ id: `${kind}:${name}:spec:${cap}`, label: 'specs/' + cap });
        const mtime = (await stat(dir).catch(() => null))?.mtimeMs ?? 0;
        return { name, progress, artifacts, mtime };
    }

    const changesDir = path.join(root, 'changes'), archiveDir = path.join(changesDir, 'archive');
    const changes = await Promise.all((await dirs(changesDir)).filter(n => n !== 'archive').map(n => change('change', path.join(changesDir, n), n)));
    const archive = (await Promise.all((await dirs(archiveDir)).map(n => change('archive', path.join(archiveDir, n), n))))
        .sort((a, b) => b.name.localeCompare(a.name) || b.mtime - a.mtime);
    const specs = (await capabilities(path.join(root, 'specs'))).map(p => ({ id: 'spec:' + p, path: p }));
    return { initialized: true, key, changes, specs, archive };
}
