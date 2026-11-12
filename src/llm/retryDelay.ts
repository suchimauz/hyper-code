/**
 * Wait for a bounded model retry delay while honoring caller cancellation
 *
 * Use in standalone model and compaction retry loops. This helper only waits; it does not decide or multiply retries.
 * @param opts.ms Delay selected by retryDecision, in milliseconds. @minimum 0
 * @param opts.signal Caller signal cancels the timer immediately.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Delay selected by retryDecision, in milliseconds. @minimum 0 */
        ms: number;
        /** Caller signal cancels the timer immediately. */
        signal?: AbortSignal;
    },
): Promise<void> {
    opts.signal?.throwIfAborted();
    await new Promise<void>((resolve,reject)=>{
     const abort=()=>{clearTimeout(timer);reject(opts.signal?.reason??new DOMException('Aborted','AbortError'));};
     const timer=setTimeout(()=>{opts.signal?.removeEventListener('abort',abort);resolve();},opts.ms);
     opts.signal?.addEventListener('abort',abort,{once:true});
     if(opts.signal?.aborted)abort();
    });
}
