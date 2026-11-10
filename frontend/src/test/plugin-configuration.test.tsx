import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PluginConfiguration } from '../components/mauzcode/PluginConfiguration';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('native configuration keeps secrets write-only and submits explicit CSRF JSON',async()=>{
 const fetch=vi.fn(async (_url:unknown,init?:RequestInit)=>new Response(JSON.stringify(init?.method==='POST'?{ok:true}:{csrfToken:'csrf',configuration:{settings:[{name:'demo.token',secret:true,configured:true,descriptor:{type:'secret',title:'API token'}},{name:'demo.enabled',secret:false,currentValue:true,descriptor:{type:'boolean',title:'Enabled'}}],secrets:[]}}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 render(<PluginConfiguration name="demo"/>);
 const input=await screen.findByPlaceholderText('Configured — leave blank to keep');expect((input as HTMLInputElement).value).toBe('');expect(input.getAttribute('type')).toBe('password');
 fireEvent.change(input,{target:{value:'replacement'}});fireEvent.click(screen.getByRole('button',{name:'Save configuration'}));
 await waitFor(()=>expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
 const init=fetch.mock.calls.find(([,init])=>init?.method==='POST')![1]!;
 expect(init.headers).toMatchObject({'Content-Type':'application/json','X-CSRF-Token':'csrf'});expect(JSON.parse(String(init.body))).toEqual({values:{'demo.token':'replacement','demo.enabled':true}});
 await screen.findByText('Configuration saved.');expect((input as HTMLInputElement).value).toBe('');
});
