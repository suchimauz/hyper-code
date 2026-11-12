/**
 * Normalize a structured proxy or ambiguous OAuth failure without leaking request secrets
 *
 * Use at inference, retry and relay boundaries, including streaming body errors. Returns null for unrelated provider failures; never infers a proxy failure from free-form text.
 * @param opts.error Transport error carrying a stable machine code.
 * @param opts.provider Runtime provider identity for retry policy.
 * @param opts.account Selected credential or relay account.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport error carrying a stable machine code. */
        error: {code?:string;message?:string;retryable?:boolean};
        /** Runtime provider identity for retry policy. */
        provider: string;
        /** Selected credential or relay account. */
        account: string;
    },
): types.llm.FailureInfo | null {
    const codes=['PROXY_DNS','PROXY_CONNECT','PROXY_TIMEOUT','PROXY_CONNECTION_LOST','PROXY_AUTH','PROXY_PROTOCOL','PROXY_TLS','PROXY_DENIED','PROXY_CONFIG','OAUTH_OUTCOME_UNKNOWN'];
    if(!opts.error.code||!codes.includes(opts.error.code))return null;
    const retryable=(['PROXY_DNS','PROXY_CONNECT','PROXY_TIMEOUT','PROXY_CONNECTION_LOST'].includes(opts.error.code)&&opts.error.retryable!==false)||(opts.error.code==='PROXY_DENIED'&&opts.error.retryable===true);
    return {code:opts.error.code as types.llm.FailureInfo['code'],kind:retryable?'transient':'fatal',provider:opts.provider,account:opts.account,retryable,message:(opts.error.message?.startsWith(opts.error.code)?opts.error.message:`${opts.error.code}: ${opts.error.message??"request failed"}`).slice(0,500)};
}
