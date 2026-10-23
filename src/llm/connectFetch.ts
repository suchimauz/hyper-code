/**
 * Fetch response headers with a two-minute deadline without limiting body streaming.
 * Abort a timed-out request before a caller retries it; preserve caller cancellation.
 * @param opts.url Provider endpoint URL.
 * @param opts.init HTTP request options, including an optional caller cancellation signal.
 * @param opts.ms Response-header deadline in milliseconds. @default 120000 @minimum 1
 */
export default async function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider endpoint URL. */ url: string;
        /** HTTP request options and optional caller cancellation signal. */ init: RequestInit;
        /** Response-header deadline in milliseconds. @default 120000 @minimum 1 */ ms?: number;
    },
): Promise<Response> {
    const ms = opts.ms ?? 120_000;
    const controller = new AbortController();
    const signal = opts.init.signal
        ? AbortSignal.any([opts.init.signal, controller.signal])
        : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            fetch(opts.url, { ...opts.init, signal }),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error(`no response from provider in ${ms / 1000}s`);
                    reject(error);
                    controller.abort(error);
                }, ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
