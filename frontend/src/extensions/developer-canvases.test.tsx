import { it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestsCanvas } from '../core-ui/developer-canvases';
import iconsExtension from '../../../plugins/icons/ui';
import { BrowserLive } from '../../../plugins/browser/ui';
const IconsCanvas = iconsExtension.canvasKinds![0]!.component as unknown as import('react').FC;
const request = vi.hoisted(() => vi.fn());
vi.mock('@mauzcode/ui', () => ({requestJson:request,Panel:({title,children}:any)=><section><h1>{title}</h1>{children}</section>,Button:({children,...props}:any)=><button {...props}>{children}</button>,TextField:({label,...props}:any)=><label>{label}<input {...props}/></label>}));
afterEach(()=>{cleanup();request.mockReset();vi.unstubAllGlobals();});
const props={context:{agentId:'test',theme:'dark' as const,readOnly:true},item:{id:1,kind:'code.tests',args:{},state:{}}};
it('reads reports without launching tests and keeps report source sandboxed',async()=>{request.mockImplementation(async(url:string)=>url.includes('/files')?[]:url.includes('/status')?{running:false}:{tests:1,failures:1,skipped:0,wall:1,at:null,top:[],slowTests:[],fails:[{name:'bad',file:'x',s:1,code:{line:1,html:'<script>bad()</script>'}}]});render(<TestsCanvas {...props}/>);await screen.findByText('bad · 1s');expect(screen.getByRole('button',{name:'Run fast'})).toBeDisabled();expect(document.querySelector('iframe')).toHaveAttribute('sandbox','');expect(request.mock.calls.every(c=>!c[1]?.method)).toBe(true);});
it('loads local icon metadata and uses image-context SVG only',async()=>{request.mockResolvedValueOnce([{name:'house',tags:['home']}]).mockResolvedValueOnce({svg:'<svg xmlns="http://www.w3.org/2000/svg"/>'});render(<IconsCanvas/>);fireEvent.click(await screen.findByRole('button',{name:'house'}));await screen.findByRole('img',{name:'house'});expect(document.querySelector('svg')).toBeNull();expect(screen.getByRole('link',{name:'Download SVG'})).toHaveAttribute('download','house.svg');});
it('does not open a browser connection until explicitly requested',async()=>{const ws=vi.fn();vi.stubGlobal('WebSocket',ws);render(<BrowserLive context={props.context}/>);expect(screen.getByRole('button',{name:'Connect'})).toBeEnabled();expect(screen.getByRole('checkbox',{name:'Enable remote control'})).toBeDisabled();await waitFor(()=>expect(ws).not.toHaveBeenCalled());});
it('sends picked paths as an object with cookie-bound CSRF only on Run',async()=>{
 request.mockImplementation(async(url:string)=>url.includes('/files')?[{file:'src/x.test.ts',tests:1,failures:0,ms:1}]:url.includes('/status')?{running:false,csrfToken:'bound'}:null);
 render(<TestsCanvas {...props} context={{...props.context,readOnly:false}}/>);
 fireEvent.click(await screen.findByRole('checkbox',{name:/src\/x.test.ts/}));
 expect(request.mock.calls.every(c=>!c[1]?.method)).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Run selected files'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith('/code/tests/run?kind=fast',{method:'POST',csrfToken:'bound',body:{files:['src/x.test.ts']}}));
});
it('requires separate connect and control gestures before sending remote actions',async()=>{
 const send=vi.fn(),close=vi.fn();
 class FakeSocket { readyState=1; send=send; close=close; }
 vi.stubGlobal('WebSocket',FakeSocket);
 render(<BrowserLive context={{...props.context,readOnly:false}}/>);
 expect(screen.getByRole('button',{name:'reload'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Connect'}));
 expect(screen.getByRole('button',{name:'reload'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Enable remote control'}));
 fireEvent.click(screen.getByRole('button',{name:'reload'}));
 expect(send).toHaveBeenCalledWith(JSON.stringify({t:'reload'}));
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));
 expect(close).toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'reload'})).toBeDisabled();
});
