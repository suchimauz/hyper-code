/**
 * Browse local workspace directories and create an explicitly named child folder for an authenticated viewer
 *
 * Use for the UI Lab workspace picker. GET accepts absolute path and showHidden; POST creates one child of an existing parent after cookie-bound CSRF validation. Never creates projects or agents, follows symlink directories, and returns no file contents.
 * @param opts.req Authenticated browser GET or CSRF-protected JSON POST request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated browser GET or CSRF-protected JSON POST request. */
        req: Request;
    },
): Promise<Response> {
    const headers = {'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(data:object,status=200)=>Response.json(data,{status,headers});
    if (!(session as Session & {user?:{id:string}})?.user) return reply({error:'Unauthorized'},401);
    if (!['GET','POST'].includes(opts.req.method)) return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
    const fs=await import('node:fs/promises');
    const path=await import('node:path');
    const os=await import('node:os');
    try {
        await ctx.fns.projects.principal({});
        if(opts.req.method==='POST') {
            if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')||''})) return reply({error:'Invalid request token'},403);
            if(opts.req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')return reply({error:'JSON body required'},415);
            const text=await opts.req.text();
            if(text.length>8192)return reply({error:'Request too large'},413);
            let data: {path?:string;name?:string};
            try{data=JSON.parse(text);}catch{return reply({error:'Invalid JSON'},400);}
            if(!data||typeof data.path!=='string'||!path.isAbsolute(data.path)||data.path.includes('\0')||typeof data.name!=='string'||!data.name||data.name==='.'||data.name==='..'||/[\/\\\0]/.test(data.name)||data.name.length>255)return reply({error:'Absolute parent path and single folder name required'},400);
            const parent=await fs.realpath(data.path);
            if(!(await fs.stat(parent)).isDirectory())return reply({error:'Parent is not a directory'},400);
            const target=path.join(parent,data.name);
            await fs.mkdir(target);
            return reply({path:target},201);
        }
        const url=new URL(opts.req.url);
        const raw=url.searchParams.get('path')||os.homedir();
        const hidden=url.searchParams.get('showHidden')??'false';
        if(!path.isAbsolute(raw)||raw.includes('\0')||raw.length>4096||!['true','false'].includes(hidden))return reply({error:'Expected absolute path and showHidden=true or false'},400);
        const dir=await fs.realpath(raw);
        const children=await fs.readdir(dir,{withFileTypes:true});
        const entries:Array<{name:string;path:string}>=[];
        for(const child of children){
            if(hidden!=='true'&&child.name.startsWith('.'))continue;
            let directory=child.isDirectory();
            if(child.isSymbolicLink()){try{directory=(await fs.stat(path.join(dir,child.name))).isDirectory();}catch{directory=false;}}
            if(directory)entries.push({name:child.name,path:path.join(dir,child.name)});
        }
        entries.sort((a,b)=>a.name.localeCompare(b.name));
        let canCreate=true;
        try{await fs.access(dir,fs.constants.W_OK|fs.constants.X_OK);}catch{canCreate=false;}
        return reply({path:dir,parentPath:path.dirname(dir)===dir?null:path.dirname(dir),entries,canCreate,csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})});
    } catch(error){
        const code=(error as {code?:string}).code;
        if(code==='ENOENT')return reply({error:'Directory not found'},404);
        if(code==='EACCES'||code==='EPERM')return reply({error:'Directory access denied'},403);
        if(code==='EEXIST')return reply({error:'Folder already exists'},409);
        if(code==='ENOTDIR'||code==='ENAMETOOLONG'||code==='EINVAL')return reply({error:'Invalid directory'},400);
        console.error('UI workspace directory request failed',error);
        return reply({error:'Unable to access workspace directory'},500);
    }
}
