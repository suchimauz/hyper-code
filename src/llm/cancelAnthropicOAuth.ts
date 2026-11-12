/**
 * Cancel one pending local Claude OAuth login without removing saved credentials
 *
 * Use from the owner connection form. Cancels only the exact pending flow UUID and leaves other accounts and proxy bindings intact.
 * @param opts.id Opaque pending flow UUID, never the OAuth state or authorization code.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque pending flow UUID, never the OAuth state or authorization code. */
        id: string;
    },
): Promise<{ok:true}> {
    const store=(ctx.state as typeof ctx.state & {llm?:{anthropicOAuth?:{pending:Map<string,{id:string;server?:{close:()=>void};verifier:string|null;status:string}>}}}).llm?.anthropicOAuth;
    for(const [state,p] of store?.pending??[]){if(p.id!==opts.id)continue;p.status='cancelled';p.verifier=null;try{p.server?.close();}catch{/* Already closed callback listener. */}store!.pending.delete(state);}
    return {ok:true};
}
