/**
 * Build a credential-safe SDK failure error
 *
 * Creates the Error thrown by models.stream, models.compact and opted-in providers: a short safe message plus `code`, HTTP `status` for the models API, `retryable`, `replaySafe` and the full `failure` metadata (classification, upstream status, retry timing, acceptance certainty). Never pass upstream bodies, tokens, continuation state or checkpoint payloads in `message`.
 * @param opts.info Failure classification and replay metadata.
 * @param opts.message Safe human-readable message without upstream bodies or secrets.
 * @param opts.status HTTP status the models API should answer with. @default 502
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Failure classification and replay metadata. */
        info: types.models.FailureInfo;
        /** Safe human-readable message without upstream bodies or secrets. */
        message: string;
        /** HTTP status the models API should answer with. @default 502 */
        status?: number;
    },
): Error & { code: string; status: number; retryable: boolean; replaySafe: boolean; failure: types.models.FailureInfo } {
    const message = ctx.fns.models.safeMessage({ message: opts.message, fallback: "Provider request failed" });
    return Object.assign(new Error(message), { code: opts.info.code, status: opts.status ?? 502, retryable: opts.info.retryable, replaySafe: opts.info.replaySafe, failure: { ...opts.info } });
}
