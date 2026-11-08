/**
 * Check imported token account-claim consistency; this does not verify JWT signatures or provenance.
 *
 * Check imported token account-claim consistency; this does not verify JWT signatures or provenance.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.t Explicit t input for this account operation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit t input for this account operation. */
        t: {access:string;accountId:string};
    },
): void {
    const t=opts.t;
    let claims:any;try{claims=JSON.parse(Buffer.from(t.access.split('.')[1],'base64url').toString())}catch{throw Error('Invalid access identity')};if(!t.accountId||claims?.['https://api.openai.com/auth']?.chatgpt_account_id!==t.accountId)throw Error('Account identity mismatch');
}
