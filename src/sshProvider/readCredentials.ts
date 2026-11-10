/**
 * Import isolated remote CLI OAuth credentials through a bounded private SSH pipe
 *
 * Read-only credential import for Codex, Claude and Kimi. Checks pinned host, file ownership, symlinks, permissions and expiration. Tokens are consumed privately, never returned, logged, refreshed remotely or put in argv.
 * @param opts.instance Pinned SSH instance.
 * @param opts.provider OAuth provider account directory.
 * @param opts.account Validated isolated account name.
 * @param opts.consume Internal encrypted-store consumer; must not expose tokens.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned SSH instance. */
        instance: string;
        /** OAuth provider account directory. */
        provider: string;
        /** Validated isolated account name. */
        account: string;
        /** Internal encrypted-store consumer; must not expose tokens. */
        consume: (tokens:{access:string;refresh:string;expires:number;accountId?:string})=>Promise<void>;
    },
): Promise<void> {
    await ctx.fns.sshProvider.binding({instance:opts.instance,provider:opts.provider,account:opts.account});if(!['codex','claude-code','kimi-coding'].includes(opts.provider))throw Error('OAuth provider required');const connection=await ctx.fns.sshInstance.connection({name:opts.instance});const consume=opts.consume;const script="import os,sys,json,stat,fcntl,time,base64\ntry:\n p,a=json.loads(sys.stdin.readline())\n parts=['.mauzcode','ssh-accounts',p,a]+(['.codex'] if p=='codex' else ['.claude'] if p=='claude-code' else [])\n filename='auth.json' if p=='codex' else '.credentials.json' if p=='claude-code' else 'kimi-code.json'\n fd=os.open(os.path.expanduser('~'),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)\n for part in parts:\n  n=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=n\n  s=os.fstat(fd)\n  if s.st_uid!=os.getuid() or s.st_mode&0o022:raise ValueError()\n auth=os.open(filename,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)\n s=os.fstat(auth)\n if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>65536:raise ValueError()\n fcntl.flock(auth,fcntl.LOCK_SH|fcntl.LOCK_NB);raw=os.read(auth,65537);os.close(auth);os.close(fd)\n v=json.loads(raw);t=v['tokens'] if p=='codex' else v['claudeAiOauth'] if p=='claude-code' else v\n access=t['accessToken'] if p=='claude-code' else t['access_token'];refresh=t['refreshToken'] if p=='claude-code' else t['refresh_token']\n exp=t.get('expiresAt',0) if p=='claude-code' else t.get('expires_at',0)*1000\n out={'access':access,'refresh':refresh,'expires':exp}\n if p=='codex':\n  claims=json.loads(base64.urlsafe_b64decode(access.split('.')[1]+'==='));out['expires']=claims['exp']*1000;out['accountId']=t['account_id']\n  if claims.get('https://api.openai.com/auth',{}).get('chatgpt_account_id')!=out['accountId']:raise ValueError()\n if not isinstance(access,str) or not access or not isinstance(refresh,str) or not refresh:raise ValueError()\n if out['expires']<=time.time()*1000+120000:sys.exit(42)\n sys.stdout.write(json.dumps(out))\nexcept Exception:sys.exit(43)\n";
         const command="python3 -c "+"'"+script.replaceAll("'","'\\''")+"'";
         const proc=Bun.spawn([connection.bin,...connection.args,connection.host,command],{stdin:'pipe',stdout:'pipe',stderr:'ignore'});
         proc.stdin.write(JSON.stringify([opts.provider,opts.account])+'\n');proc.stdin.end();
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
          if(!tokens||typeof tokens.access!=='string'||typeof tokens.refresh!=='string'||!Number.isFinite(tokens.expires)||tokens.expires<=Date.now()+120000)throw Error('Import failed: invalid credential shape');
          text='';await consume(tokens);
         }finally{text='';clearTimeout(timer);proc.kill();await proc.exited}
}
