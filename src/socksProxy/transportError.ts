/**
 * Create a safe classified SOCKS transport error
 *
 * Use for transport failures without exposing proxy credentials, URLs or upstream error messages. Cancellation is an AbortError; requestSent tracks conservative HTTP replay safety.
 * @param opts.code Stable transport failure code, or ABORT_ERR for cancellation.
 * @param opts.message Static safe diagnostic without credentials or URLs.
 * @param opts.requestSent Whether HTTP bytes might have been sent.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable transport failure code, or ABORT_ERR for cancellation. */
        code: string;
        /** Static safe diagnostic without credentials or URLs. */
        message: string;
        /** Whether HTTP bytes might have been sent. */
        requestSent: boolean;
    },
): Error & {code:string;retryable:boolean;noFallback:true;requestSent:boolean} {
    return Object.assign(new Error(opts.message),{name:opts.code==='ABORT_ERR'?'AbortError':'Error',code:opts.code,retryable:['PROXY_DNS','PROXY_CONNECT','PROXY_TIMEOUT','PROXY_CONNECTION_LOST'].includes(opts.code)||(opts.code==='PROXY_DENIED'&&!opts.requestSent),noFallback:true as const,requestSent:opts.requestSent});
}
