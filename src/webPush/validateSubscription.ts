/**
 * Validate a Web Push subscription against a fixed provider allowlist.
 *
 * Use before persisting subscriptions and every send. Rejects unsafe endpoints and malformed encryption keys without echoing their values.
 * @param opts.subscription Browser push endpoint and encryption keys.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Browser push endpoint and encryption keys. */
        subscription: {endpoint:string;keys:{p256dh:string;auth:string}};
    },
): Promise<{endpoint:string;keys:{p256dh:string;auth:string}}> {
    const s=opts.subscription;
    if (!s || typeof s.endpoint !== 'string' || s.endpoint.length>2048) throw new Error('Invalid push subscription');
    let u:URL; try {u=new URL(s.endpoint);} catch {throw new Error('Invalid push endpoint');}
    const host=u.hostname;
    const allowed=host==='web.push.apple.com'||host==='fcm.googleapis.com'||host==='push.services.mozilla.com'||/^[a-z0-9-]{1,63}\.push\.services\.mozilla\.com$/.test(host);
    if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.href!==s.endpoint) throw new Error('Unsupported push endpoint');
    for(const [key,length] of [['p256dh',65],['auth',16]] as const){const value=s.keys?.[key]; if(typeof value!=='string'||! /^[A-Za-z0-9_-]+$/.test(value)||Buffer.from(value,'base64url').length!==length||Buffer.from(value,'base64url').toString('base64url')!==value) throw new Error('Invalid push key');}
    if(Buffer.from(s.keys.p256dh,'base64url')[0]!==4) throw new Error('Invalid push public key');
    return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
