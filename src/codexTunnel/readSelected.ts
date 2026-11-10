/**
 * Consume selected Codex credentials privately through a bounded read-only SSH pipe
 *
 * Owner-authorized importer for an explicit SSH instance and isolated account slot. Keeps credentials internal to the callback and refuses expired access without refreshing.
 * @param opts.instance Configured SSH instance name, validated before connection lookup.
 * @param opts.account Isolated Codex account directory name, never a path.
 * @param opts.consume Internal authenticated probe and encrypted-save callback; never expose tokens.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name: 1–64 letters, digits, underscores, dots or hyphens; starts alphanumeric. */
        instance: string;
        /** Isolated account slot: 1–40 letters, digits, underscores or hyphens; starts alphanumeric. */
        account: string;
        /** Internal authenticated probe and encrypted-save callback; never expose tokens. */
        consume: (tokens:{access:string;refresh:string;accountId:string;expires:number})=>Promise<void>;
    },
): Promise<void> {
    await ctx.fns.sshAccount.requireOwner({});
    if (typeof opts.instance !== 'string' || typeof opts.account !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(opts.account)) throw Error('Invalid Codex account');
    const connection=await ctx.fns.sshInstance.connection({name:opts.instance});const consume=opts.consume;const script="# Trusted selected-slot read-only importer. Output is private subprocess pipe only.\nimport os,sys,json,stat,fcntl,time,base64\n\ndef main():\n    home=os.path.expanduser('~')\n    parts=['.mauzcode','ssh-accounts','codex',sys.argv[1],'.codex']\n    fd=os.open(home,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)\n    try:\n        for part in parts:\n            next_fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)\n            os.close(fd);fd=next_fd\n            s=os.fstat(fd)\n            if s.st_uid!=os.getuid() or s.st_mode&0o022: raise ValueError()\n        auth=os.open('auth.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)\n        try:\n            s=os.fstat(auth)\n            if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>65536:raise ValueError()\n            fcntl.flock(auth,fcntl.LOCK_SH|fcntl.LOCK_NB)\n            raw=os.read(auth,65537)\n            if len(raw)>65536:raise ValueError()\n            value=json.loads(raw);t=value['tokens']\n            access=t['access_token'];refresh=t['refresh_token'];account=t['account_id']\n            if not all(isinstance(x,str) and x for x in [access,refresh,account]):raise ValueError()\n            payload=access.split('.')[1];claims=json.loads(base64.urlsafe_b64decode(payload+'='*((-len(payload))%4)))\n            exp=claims['exp']\n            if not isinstance(exp,(int,float)) or isinstance(exp,bool) or exp<=time.time()+120:sys.exit(42)\n            if claims.get('https://api.openai.com/auth',{}).get('chatgpt_account_id')!=account:raise ValueError()\n            sys.stdout.write(json.dumps({'access':access,'refresh':refresh,'accountId':account,'expires':exp*1000}))\n        finally:os.close(auth)\n    finally:os.close(fd)\ntry:main()\nexcept Exception:sys.exit(43)\n";
     const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
     const command="python3 -c "+quote(script)+" "+quote(opts.account);
     const proc=Bun.spawn([connection.bin,...connection.args,connection.host,command],{stdin:'ignore',stdout:'pipe',stderr:'ignore'});
     let timedOut=false;const timer=setTimeout(()=>{timedOut=true;proc.kill()},15000);
     let text='';
     try{
      const reader=proc.stdout.getReader();const decoder=new TextDecoder();let count=0;
      while(true){const item=await reader.read();if(item.done)break;count+=item.value.length;if(count>65536){proc.kill();throw Error('Import rejected: oversized private response')}text+=decoder.decode(item.value,{stream:true})}
      const code=await proc.exited;
      if(timedOut)throw Error('Import SSH timed out');
      if(code===42)throw Error('Import refused: access token expired or expires within 120 seconds; no refresh attempted');
      if(code!==0)throw Error('Import failed: private SSH credential validation');
      let tokens;try{tokens=JSON.parse(text)}catch{throw Error('Import failed: malformed private response')}
      if(!tokens||typeof tokens.access!=='string'||typeof tokens.refresh!=='string'||typeof tokens.accountId!=='string'||!Number.isFinite(tokens.expires)||tokens.expires<=Date.now()+120000)throw Error('Import failed: invalid credential shape');
      text='';await consume(tokens);
     }finally{text='';clearTimeout(timer);proc.kill();await proc.exited}
}
