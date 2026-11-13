/**
 * Extract a contiguous one-sided range present in a unified diff; return null for lines outside its hunks.
 *
 * Extract a contiguous one-sided range present in a unified diff; return null for lines outside its hunks.
 * @param opts.patch Unified patch returned by gitUi.diff.
 * @param opts.side Side whose line numbers are selected.
 * @param opts.start Inclusive first line, starting at one.
 * @param opts.end Inclusive last line.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Unified patch returned by gitUi.diff. */
        patch: string;
        /** Side whose line numbers are selected. */
        side: 'old'|'new';
        /** Inclusive first line, starting at one. */
        start: number;
        /** Inclusive last line. */
        end: number;
    },
): Promise<string | null> {
    const lines=new Map<number,string>();let old=0,next=0,inHunk=false;
    for(const line of opts.patch.split('\n')){
     const h=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
     if(h){old=Number(h[1]);next=Number(h[2]);inHunk=true;continue;}
     if(!inHunk||line.startsWith('\\'))continue;
     const c=line[0];
     if(c===' '){lines.set(opts.side==='old'?old:next,line.slice(1));old++;next++;}
     else if(c==='-'){if(opts.side==='old')lines.set(old,line.slice(1));old++;}
     else if(c==='+'){if(opts.side==='new')lines.set(next,line.slice(1));next++;}
     else inHunk=false;
    }
    if(!Number.isSafeInteger(opts.start)||!Number.isSafeInteger(opts.end)||opts.start<1||opts.end<opts.start||opts.end-opts.start>2048)return null;
    const selected:string[]=[];for(let n=opts.start;n<=opts.end;n++){const text=lines.get(n);if(text===undefined)return null;selected.push(text);}
    return selected.join('\n');
}
