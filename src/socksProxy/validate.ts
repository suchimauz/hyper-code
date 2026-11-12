/**
 * Normalize and validate SOCKS5 proxy fields without network access
 *
 * Use before persistence to validate DNS names, IPv4, IPv6, port and complete credential replacements.
 * @param opts.name Optional display name, at most 100 characters.
 * @param opts.host DNS hostname or IP literal without URL components.
 * @param opts.port Integer SOCKS5 port. @minimum 1 @maximum 65535
 * @param opts.auth Enable username/password authentication.
 * @param opts.username Replacement username, requires password, at most 255 UTF-8 bytes.
 * @param opts.password Replacement password preserved verbatim, requires username, at most 255 UTF-8 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Optional display name, at most 100 characters. */
        name?: string | null;
        /** DNS hostname or IP literal without URL components. */
        host: string;
        /** Integer SOCKS5 port. @minimum 1 @maximum 65535 */
        port: number;
        /** Enable username/password authentication. */
        auth: boolean;
        /** Replacement username, requires password, at most 255 UTF-8 bytes. */
        username?: string;
        /** Replacement password preserved verbatim, requires username, at most 255 UTF-8 bytes. */
        password?: string;
    },
): Promise<{name:string|null;host:string;port:number;auth:boolean;username?:string;password?:string}> {
    const fail=()=>{throw Object.assign(new Error('Invalid proxy fields'),{status:400});};
    if(opts.name!==undefined&&opts.name!==null&&(typeof opts.name!=='string'||opts.name.length>100))fail();
    if(typeof opts.host!=='string'||typeof opts.auth!=='boolean'||!Number.isInteger(opts.port)||opts.port<1||opts.port>65535)fail();
    let host=opts.host.trim();if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
    const {isIP}=await import('node:net');if(!host||host.length>253)fail();
    if(!isIP(host)){if(!/^[a-zA-Z0-9.-]+$/.test(host)||host.split('.').some(x=>!x||x.length>63||!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(x))||/^[0-9.]+$/.test(host))fail();host=host.toLowerCase();}else if(isIP(host)===6){host=new URL('http://['+host+']/').hostname.slice(1,-1);}
    const replacing=opts.username!==undefined||opts.password!==undefined;
    if(replacing){for(const value of [opts.username,opts.password])if(typeof value!=='string'||!value.length||Buffer.byteLength(value,'utf8')>255)fail();if(!opts.auth)fail();}
    return {name:opts.name?.trim()||null,host,port:opts.port,auth:opts.auth,...(replacing?{username:opts.username,password:opts.password}:{})};
}
