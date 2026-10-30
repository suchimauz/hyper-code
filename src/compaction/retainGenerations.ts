/**
 * Retain active and pending compaction generations while bounding historical entries
 *
 * Use when appending a draft compaction generation. Preserve the active and draft revision regardless of age, fill the remaining eight-entry budget with the newest history, and leave input order and generation payloads unchanged.
 * @param opts.generations Generation records in chronological insertion order; payloads are preserved without mutation.
 * @param opts.activeRevision Currently activated revision that must never be evicted.
 * @param opts.draftRevision Pending draft revision that must remain available for promotion or failure.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Generation records in chronological insertion order; payloads are preserved without mutation. */
        generations: Array<{ revision: number; [key: string]: unknown }>;
        /** Currently activated revision that must never be evicted. */
        activeRevision: number | null;
        /** Pending draft revision that must remain available for promotion or failure. */
        draftRevision: number | null;
    },
): Promise<Array<{ revision: number; [key: string]: unknown }>> {
    const protectedEntries = new Set(opts.generations.filter(g => g.revision === opts.activeRevision || g.revision === opts.draftRevision));
    const history = opts.generations.filter(g => !protectedEntries.has(g));
    const remaining = Math.max(0, 8 - protectedEntries.size);
    const retained = new Set([...protectedEntries, ...(remaining ? history.slice(-remaining) : [])]);
    return opts.generations.filter(g => retained.has(g));
}
