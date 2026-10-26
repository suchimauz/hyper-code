import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
import home from '../home/render';
import mentions from '../mentions/badge';

// Counter colors are deliberately opaque: contrast must not depend on the surface behind them.
test('home and mention counts share accessible, non-translucent unread styling',async()=>{
 const ctx:any={fns:{
  procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(text)}},
  session:{list:async()=>[{id:'a',title:'Chat',runState:'idle',unread:12}]},
  llm:{listAccounts:async()=>[]},agent:{teamActivity:async()=>({})},
  auth:{viewerId:async()=> 'viewer'},
  mentions:{unreadCount:async()=>12,list:async()=>[],rowsHtml:async()=>''},
  ui:{inplacePopup:async(o:any)=>`<button ${o.triggerAttrs}>${o.triggerHtml}</button>`},
 }};
 const w=new Window();
 w.document.body.innerHTML=(await home(ctx,null,{})).main+await mentions(ctx,null,{});
 const badges=[...w.document.querySelectorAll('.ui-unread-badge')];
 expect(badges.length).toBe(2);
 for(const badge of badges){expect(badge.textContent).toContain('12');expect(badge.className).not.toMatch(/text-white|bg-success|bg-primary/);}
 expect(badges[0]!.getAttribute('aria-label')).toBe('12 new messages');
 expect(badges[1]!.closest('button')!.getAttribute('aria-label')).toBe('12 unread mentions');
 ctx.fns.session.list=async()=>[{id:'a',title:'Chat',unread:0}];
 ctx.fns.mentions.unreadCount=async()=>0;
 expect((await home(ctx,null,{})).main).not.toContain('ui-unread-badge');
 expect(await mentions(ctx,null,{})).not.toContain('ui-unread-badge');
 w.happyDOM.abort();
});

test('shared unread counters meet WCAG AA in light and dark themes',async()=>{
 const css=await Bun.file(new URL('../dock/$style_navigation.css',import.meta.url)).text();
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1]!.includes('.ui-unread-badge')&&m[2]!.includes('background:'));
 expect(rules.length).toBe(2);
 const luminance=(hex:string)=>{
  const channels=hex.match(/\w\w/g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return channels[0]!*.2126+channels[1]!*.7152+channels[2]!*.0722;
 };
 for(const rule of rules){
  const colors=['background','color'].map(property=>{
   const value=rule[2]!.match(new RegExp(`(?:^|;)\\s*${property}:\\s*#([0-9a-f]{3,6})(?:;|\\s|$)`))?.[1];
   expect(value).toBeDefined();
   return luminance(value!.length===3?value!.split('').map(c=>c+c).join(''):value!);
  });
  expect((Math.max(...colors)+.05)/(Math.min(...colors)+.05)).toBeGreaterThanOrEqual(4.5);
 }
});
