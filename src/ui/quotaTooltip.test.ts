import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const script=await Bun.file(new URL('./$script_quotaTip.js',import.meta.url)).text();
const formatOptions={day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'} as const;
const iso='2030-03-10T01:34:00.000Z';
const markup=(value=iso)=>`<a class="quota-ring" aria-label="Model · Five-hour 20% used · resets UTC fallback"><span class="quota-tip" aria-hidden="true"><time datetime="${value}" data-quota-reset-detail>UTC fallback</time></span></a>`;

for(const zone of ['Europe/Moscow','America/Los_Angeles','Asia/Kathmandu']){
 test('reset detail and accessible label use client timezone '+zone+' on initial and live renders',async()=>{
  const w=new Window();try{
   // Emulate a browser timezone independently of the server/test runner's timezone.
   (w as any).Intl={DateTimeFormat:function(locale:string,options:Intl.DateTimeFormatOptions){
    expect(options.timeZone).toBeUndefined();
    return new Intl.DateTimeFormat(locale,{...options,timeZone:zone});
   }};
   const expected=new Intl.DateTimeFormat('ru-RU',{...formatOptions,timeZone:zone}).format(new Date(iso));
   const check=()=>{
    expect(w.document.querySelector('time')!.textContent).toBe(expected);
    expect(w.document.querySelector('time')!.dateTime).toBe(iso);
    expect(w.document.querySelector('.quota-ring')!.getAttribute('aria-label')).toBe('Model · Five-hour 20% used · resets '+expected);
   };
   w.document.body.innerHTML=markup();w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));check();
   // HTMX 4 uses colon-separated lifecycle names; the legacy event never fires.
   w.document.body.innerHTML=markup();w.document.body.dispatchEvent(new w.CustomEvent('htmx:after:swap',{bubbles:true,detail:{ctx:{target:w.document.body}}}));check();
   w.document.body.dispatchEvent(new w.CustomEvent('htmx:after:swap',{bubbles:true}));check();
   expect(w.document.querySelector('.quota-matrix-reset')).toBeNull();
  }finally{await w.happyDOM.close()}
 });
}

test('hover and keyboard focus localize newly inserted reset details without a swap event',async()=>{
 const w=new Window();try{
  w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const expected=new Intl.DateTimeFormat('ru-RU',formatOptions).format(new Date(iso));
  for(const event of ['pointerover','focusin']){
   w.document.body.innerHTML=markup();w.document.querySelector('.quota-ring')!.dispatchEvent(new w.Event(event,{bubbles:true}));
   expect(w.document.querySelector('time')!.textContent).toBe(expected);
   expect(w.document.querySelector('.quota-ring')!.getAttribute('aria-label')).toContain('resets '+expected);
  }
 }finally{await w.happyDOM.close()}
});

test('invalid reset timestamps keep their fallback without breaking other cards',async()=>{
 const w=new Window();try{
  w.document.body.innerHTML=markup('not-a-date')+markup();w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  expect(w.document.querySelector('time')!.textContent).toBe('UTC fallback');
  expect(w.document.querySelectorAll('time')[1]!.textContent).not.toBe('UTC fallback');
 }finally{await w.happyDOM.close()}
});

test('tooltip measures after opening, stays inside the viewport and flips below a top-edge ring',async()=>{
 const w=new Window({width:320,height:600});try{
  w.document.body.innerHTML=markup();
  const ring=w.document.querySelector('.quota-ring') as any,tip=w.document.querySelector('.quota-tip') as any;
  let opened=false,top=500;
  tip.showPopover=()=>{opened=true;};tip.hidePopover=()=>{opened=false;};
  tip.matches=(selector:string)=>selector===':popover-open'&&opened;
  Object.defineProperties(tip,{offsetWidth:{get:()=>{expect(opened).toBe(true);return 240;}},offsetHeight:{get:()=>140},clientHeight:{get:()=>138},scrollHeight:{get:()=>138}});
  ring.getBoundingClientRect=()=>({left:280,right:312,top,bottom:top+32,width:32,height:32});
  w.eval(script);ring.dispatchEvent(new w.Event('focusin',{bubbles:true}));
  expect(tip.style.left).toBe('72px');expect(tip.style.top).toBe('352px');expect(tip.dataset.side).toBe('above');expect(tip.hasAttribute('data-clipped')).toBe(false);
  top=4;w.dispatchEvent(new w.Event('resize'));
  expect(tip.style.top).toBe('44px');expect(tip.dataset.side).toBe('below');
  top=570;w.document.dispatchEvent(new w.Event('scroll'));
  expect(tip.style.top).toBe('422px');expect(tip.dataset.side).toBe('above');
 }finally{await w.happyDOM.close()}
});
