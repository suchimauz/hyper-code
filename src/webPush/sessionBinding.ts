/**
 * Derive a stable push binding from a verified authentication cookie.
 *
 * Internal helper for authenticated routes and logout. OIDC uses its stable session ID; password sessions use the token hash. Never returns the bearer token.
 * @param opts.token Authentication cookie, kept out of logs.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authentication cookie, kept out of logs. */
        token: string;
    },
): Promise<{key:string;sessionId:string|null;ownerId:string;expiresAt:number}|null> {
    const claims=await ctx.fns.procs.auth.verify({token:opts.token,allowExpired:true}).catch(()=>null);
    if(!claims?.sub || claims.kind) return null;
    const sid=String(claims.jti??'');
    const sessionId=sid.startsWith('s_')?sid:null;
    let expiresAt=Number(claims.exp)*1000;
    if(sessionId){const rows=await ctx.fns.procs.db.select({sql:'SELECT expires_at FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL',params:[sessionId,claims.sub]}); if(!rows.length)return null; expiresAt=Number(rows[0].expires_at);}
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
    const {createHash}=await import('node:crypto');
    return {key:createHash('sha256').update(sessionId??opts.token).digest('hex'),sessionId,ownerId:String(claims.sub),expiresAt};
}
