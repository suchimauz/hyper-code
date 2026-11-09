import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { utilityExtension } from '../core-ui/utilities';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const context={readOnly:false} as any;
test('update requires a separate confirmation and sends the displayed target',async()=>{
 const calls: {url:string;init?:RequestInit}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push({url,init});return new Response(JSON.stringify(url.includes('/apply')?{message:'Staged'}:{csrfToken:'cookie-token',status:{state:'available',message:'Ready',current:'old',target:'new',clean:true}}),{headers:{'Content-Type':'application/json'}});}));
 const View=utilityExtension.pages!.find(p=>p.id==='update')!.component;
 render(<View context={context}/>);
 await screen.findByText('Ready');
 fireEvent.click(screen.getByRole('button',{name:'Update and restart…'}));
 expect(calls.filter(c=>c.init?.method==='POST')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Confirm update and restart'}));
 await waitFor(()=>expect(calls.filter(c=>c.init?.method==='POST')).toHaveLength(1));
 const sent=calls.find(c=>c.init?.method==='POST')!;
 expect(JSON.parse(String(sent.init?.body))).toEqual({confirmed:true,target:'new'});
 expect(new Headers(sent.init?.headers).get('X-CSRF-Token')).toBe('cookie-token');
});
test('autotext sends nothing merely by opening the page',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const View=utilityExtension.pages!.find(p=>p.id==='autotext')!.component;
 render(<View context={context}/>);
 expect(screen.getByLabelText('Article draft')).toBeTruthy();
 expect(fetcher).not.toHaveBeenCalled();
});
