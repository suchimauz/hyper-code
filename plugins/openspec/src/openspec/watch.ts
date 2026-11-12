import { watch as watchFs, statSync, readdirSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
type Entry = { key: string; touch: () => void; close: () => void };
type WatchState = { openspecWatchers?: Map<string, Entry> };
/**
 * Start or touch an idle-expiring local OpenSpec file watcher for Canvas refresh.
 *
 * Use from an authorized snapshot request. Shares recursive watchers, debounces events for 300 ms and broadcasts only openspec.changed with the snapshot-compatible opaque key. Closes after ten minutes idle; watches existing parents before initialization and falls back to two-second metadata polling on native watcher errors.
 * @param opts.dir Absolute local workspace directory from the authorized owned Canvas item.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Absolute local workspace directory from the authorized owned Canvas item. */
        dir: string;
    },
): Promise<{ key: string }> {
    if (typeof opts.dir !== 'string' || !path.isAbsolute(opts.dir) || opts.dir.includes('\0')) throw new Error('openspec.watch: an absolute workspace directory is required');
    const dir = path.resolve(opts.dir);
    const state = ctx.state as typeof ctx.state & WatchState;
    const entries = state.openspecWatchers ??= new Map<string, Entry>();
    const existing = entries.get(dir);
    if (existing) { existing.touch(); return { key: existing.key }; }
    const key = new Bun.CryptoHasher('sha256').update(dir).digest('hex').slice(0, 16);
    const root = path.join(dir, '.mauzcode', 'openspec');
    let native: FSWatcher | undefined;
    let target = '';
    let closed = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let previous = '';
    const isDirectory = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };
    const fingerprint = (): string => {
        const rows: string[] = [];
        const walk = (p: string) => {
            try {
                const s = statSync(p);
                rows.push(p + ':' + s.mtimeMs + ':' + s.ctimeMs + ':' + s.size);
                for (const e of readdirSync(p, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
                    const f = path.join(p, e.name);
                    if (e.isDirectory()) walk(f);
                    else if (!e.isSymbolicLink()) { const m = statSync(f); rows.push(f + ':' + m.mtimeMs + ':' + m.ctimeMs + ':' + m.size); }
                }
            } catch { rows.push(p + ':unavailable'); }
        };
        walk(root);
        return new Bun.CryptoHasher('sha256').update(rows.join('\n')).digest('hex');
    };
    const changed = () => {
        if (closed) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
            debounce = undefined;
            if (!closed) ctx.fns.procs.events.emit({ event: { type: 'openspec.changed', key } });
        }, 300);
        debounce.unref();
    };
    const fallback = () => {
        native?.close(); native = undefined;
        if (closed || poll) return;
        previous = fingerprint();
        poll = setInterval(() => { const next = fingerprint(); if (next !== previous) { previous = next; changed(); } }, 2000);
        poll.unref();
    };
    const attach = () => {
        if (closed || poll) return;
        let next = root;
        while (!isDirectory(next) && path.dirname(next) !== next) next = path.dirname(next);
        if (native && next === target) return;
        native?.close(); native = undefined; target = next;
        try {
            native = watchFs(target, { recursive: true }, (_event, filename) => {
                if (closed) return;
                const file = filename == null ? root : path.resolve(target, String(filename));
                if (file === root || file.startsWith(root + path.sep) || root.startsWith(file + path.sep)) { changed(); attach(); }
            });
            native.on('error', () => { changed(); fallback(); });
            native.unref();
        } catch { fallback(); }
    };
    const entry: Entry = {
        key,
        touch: () => { if (idle) clearTimeout(idle); idle = setTimeout(() => entry.close(), 10 * 60 * 1000); idle.unref(); },
        close: () => {
            closed = true; native?.close();
            if (debounce) clearTimeout(debounce);
            if (idle) clearTimeout(idle);
            if (poll) clearInterval(poll);
            if (entries.get(dir) === entry) entries.delete(dir);
        },
    };
    entries.set(dir, entry);
    entry.touch(); attach();
    return { key };
}
