/**
 * Validates and normalizes a versioned compact Git review reference stored on a user event.
 *
 * Use when persisting or reading the gitReview field of a git_review_comments user event (session.appendUserMessage eventExtra, events API projection). Returns the canonical version-1 reference {version,host,dir,count,ids} or null for absent/legacy/malformed values, so legacy full-text review messages fall back to their readable text. It never reads or writes the transcript.
 * @param opts.value Candidate reference value, typically event.gitReview from a persisted event payload.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Candidate reference value, typically event.gitReview from a persisted event payload. */
        value: unknown;
    },
): Promise<types.session.ReviewReference | null> {
    const v=opts.value as Record<string,unknown>|null|undefined;
        if(!v||typeof v!=='object'||Array.isArray(v)||v.version!==1)return null;
        const {host,dir,count,ids}=v as {host:unknown;dir:unknown;count:unknown;ids:unknown};
        if(typeof host!=='string'||!host||host.length>256||typeof dir!=='string'||!dir.startsWith('/')||dir.length>4096)return null;
        if(!Array.isArray(ids)||ids.length<1||ids.length>500)return null;
        const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
        const normalized=ids.map(id=>typeof id==='string'?id.toLowerCase():'');
        if(normalized.some(id=>!uuid.test(id))||new Set(normalized).size!==normalized.length||count!==normalized.length)return null;
        return {version:1,host,dir,count:normalized.length,ids:normalized};
}
