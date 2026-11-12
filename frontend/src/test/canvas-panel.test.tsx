import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasPanel } from '../components/mauzcode/CanvasPanel';
import { parseCanvasTabs } from '../components/mauzcode/canvasTabs';
import { readTabs } from '../components/mauzcode/canvasTabs';
import { createExtensionRegistry } from '../extensions/registry';
import type { ExtensionLauncherProps, UiExtension } from '../extensions/types';
const launcherExtension: UiExtension = { id: 'terminal', apiVersion: 1, canvasLaunchers: [{ id: 'terminal', title: 'Terminal', description: 'Shell', component: ({ active, tabId }: ExtensionLauncherProps) => <div hidden={!active}>Terminal content {tabId}</div> }] };
const pluginUi = vi.hoisted(() => ({ state: null as any }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => pluginUi.state }));
const setLaunchers = (loaded = true, icon: string | null = 'ph-terminal-window', extensions = [launcherExtension]) => {
  pluginUi.state = { registry: createExtensionRegistry(extensions, { terminal: { canvasLaunchers: ['terminal'] } }, { terminal: icon }), applications: {}, errors: {}, loaded };
};
setLaunchers();
const props = {agentId:'a', revision:'1', theme:'light' as const, onClose:vi.fn(), expanded:false, onExpand:vi.fn()};
const tab = {id:12,title:'File <unsafe>',icon:'file-text',active:true};
afterEach(()=>{setLaunchers();localStorage.clear();vi.unstubAllGlobals();vi.useRealTimers();});
function api(items = [tab]) { const fetcher=vi.fn(async(_url: string)=>Response.json({items}));vi.stubGlobal('fetch',fetcher);return fetcher; }
it('reads JSON tabs and uses an item document, never a mobile shell',async()=>{
 const fetcher=api();render(<CanvasPanel {...props}/>);
 expect(await screen.findByRole('tab',{name:'File <unsafe>'})).toBeInTheDocument();
 expect(fetcher.mock.calls[0]?.[0]).toBe('/canvas/a/state');
 expect(screen.getByTitle(`Canvas: ${tab.title}`)).toHaveAttribute('src','/canvas/a/item/12/document?theme=light');
 expect(document.querySelector('iframe[src*="mobile"]')).toBeNull();
});
it('preserves a live document across revisions and refreshes JSON metadata',async()=>{
 api();const ui=render(<CanvasPanel {...props}/>);const frame=await screen.findByTitle(`Canvas: ${tab.title}`);
 ui.rerender(<CanvasPanel {...props} revision="2"/>);
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(screen.getByTitle(`Canvas: ${tab.title}`)).toBe(frame);
});
it('rejects stale responses after switching agents',async()=>{
 let resolve!: (value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue(Response.json({items:[{...tab,id:20,title:'B'}]})));
 const ui=render(<CanvasPanel {...props}/>);ui.rerender(<CanvasPanel {...props} agentId="b"/>);
 await screen.findByRole('tab',{name:'B'});await act(async()=>resolve(Response.json({items:[tab]})));
 expect(screen.queryByRole('tab',{name:tab.title})).toBeNull();expect(screen.getByTitle('Canvas: B')).toHaveAttribute('src','/canvas/b/item/20/document?theme=light');
});
it('shows retry on a failed JSON request',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('',{status:401})).mockResolvedValue(Response.json({items:[]})));
 render(<CanvasPanel {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Повторить'}));
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
});
it('keeps local Start and Terminal tabs and keyboard actions',async()=>{
 api([]);render(<CanvasPanel {...props}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:'Новая вкладка'}));expect(screen.getAllByRole('tab',{name:'Start'})).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:/Terminal/}));expect(screen.getByRole('tab',{name:'Terminal'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('button',{name:'Свернуть Canvas'}));expect(props.onClose).toHaveBeenCalled();
});
it('Start lists plugin launchers with the plugin icon and opens their page',async()=>{
 api([]);render(<CanvasPanel {...props}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());
 const button=document.querySelector<HTMLButtonElement>('.canvas-start-entry[data-launcher="terminal/terminal"]')!;expect(button.querySelector('i.ph.ph-terminal-window')).not.toBeNull();
 fireEvent.click(button);expect(screen.getByText(/Terminal content page-/)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Новая вкладка'}));fireEvent.click(document.querySelector('.canvas-start-entry[data-launcher="terminal/terminal"]')!);
 expect(screen.getByRole('tab',{name:'Terminal 2'})).toHaveAttribute('aria-selected','true');
});
it('launcher icon falls back to the default without a plugin icon, and own icon wins',()=>{
 expect(createExtensionRegistry([launcherExtension],{terminal:{canvasLaunchers:['terminal']}}).canvasLaunchers[0]?.icon).toBeNull();
 const own={...launcherExtension,canvasLaunchers:[{...launcherExtension.canvasLaunchers![0]!,icon:'ph-code'}]};
 expect(createExtensionRegistry([own],{terminal:{canvasLaunchers:['terminal']}},{terminal:'ph-terminal-window'}).canvasLaunchers[0]?.icon).toBe('ph-code');
 expect(createExtensionRegistry([launcherExtension],{terminal:{}}).canvasLaunchers).toHaveLength(0);
});
it('migrates stored Terminal tabs to the terminal plugin launcher',()=>{
 localStorage.setItem('mauzcode.canvas.tabs.m',JSON.stringify({starts:[],terms:[3],next:4,selected:'terminal-3'}));
 expect(readTabs('m')).toEqual({starts:[],pages:[{n:3,launcher:'terminal/terminal'}],next:4,selected:'page-3'});
});
it('a tab of an unavailable plugin shows a notice',async()=>{
 setLaunchers(true,null,[]);localStorage.setItem('mauzcode.canvas.tabs.a',JSON.stringify({starts:[],pages:[{n:2,launcher:'terminal/terminal'}],next:3,selected:'page-2'}));
 api([]);render(<CanvasPanel {...props}/>);expect(await screen.findByText(/Плагин недоступен/)).toBeInTheDocument();
});
it('validates tab metadata instead of parsing HTML',()=>{
 expect(()=>parseCanvasTabs({items:[{...tab,id:'12'}]})).toThrow();expect(()=>parseCanvasTabs('<div>')).toThrow();
 expect(parseCanvasTabs({items:[tab]})).toEqual([tab]);
});

it('opens Workspace and reads its directory using the state token without a meta tag',async()=>{
 document.querySelector('meta[name="csrf-token"]')?.remove();
 let opened=false;
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/canvas/a/state') return Response.json({csrfToken:'cookie-bound-state',items:opened?[{id:7,title:'Workspace',icon:'folder',active:true,kind:'file',args:{path:'/workspace',host:'local'}}]:[]});
  expect(new Headers(init?.headers).get('x-csrf-token')).toBe('cookie-bound-state');
  if(url==='/canvas/a'){opened=true;return Response.json({activeItemId:7});}
  if(url==='/canvas/a/item/7') return Response.json({path:'/workspace',isDir:true,entries:[{name:'README.md',isDir:false}]});
  throw new Error(`Unexpected request ${url}`);
 });
 vi.stubGlobal('fetch',fetcher);render(<CanvasPanel {...props}/>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/canvas/a/state',expect.anything()));
 fireEvent.click(await screen.findByRole('button',{name:/Workspace files/}));
 expect(await screen.findByRole('button',{name:'README.md'})).toBeInTheDocument();
 expect(screen.queryByRole('alert')).toBeNull();
});
it('one-step launcher opens a server item directly, without a local launcher tab',async()=>{
 let items:any[]=[];vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items})));
 const open=vi.fn(async(context:{agentId:string|null})=>{expect(context.agentId).toBe('a');items=[{id:15,title:'OpenSpec · w',icon:'list-checks',active:true}];return {id:15};});
 const ext:UiExtension={id:'openspec',apiVersion:1,canvasLaunchers:[{id:'openspec',title:'OpenSpec',open}]};
 pluginUi.state={registry:createExtensionRegistry([ext],{openspec:{canvasLaunchers:['openspec']}}),applications:{},errors:{},loaded:true};
 render(<CanvasPanel {...props}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());
 fireEvent.click(document.querySelector('.canvas-start-entry[data-launcher="openspec/openspec"]')!);
 expect(await screen.findByRole('tab',{name:'OpenSpec · w'})).toHaveAttribute('aria-selected','true');
 expect(open).toHaveBeenCalledTimes(1);expect(screen.queryByRole('tab',{name:'Start'})).toBeNull();expect(screen.queryByRole('tab',{name:'OpenSpec'})).toBeNull();
});
it('one-step launcher errors stay on the Start page',async()=>{
 api([]);const ext:UiExtension={id:'openspec',apiVersion:1,canvasLaunchers:[{id:'openspec',title:'OpenSpec',open:async()=>{throw new Error('SSH workspace');}}]};
 pluginUi.state={registry:createExtensionRegistry([ext],{openspec:{canvasLaunchers:['openspec']}}),applications:{},errors:{},loaded:true};
 render(<CanvasPanel {...props}/>);await waitFor(()=>expect(fetch).toHaveBeenCalled());
 fireEvent.click(document.querySelector('.canvas-start-entry[data-launcher="openspec/openspec"]')!);
 expect(await screen.findByRole('alert')).toHaveTextContent('SSH workspace');expect(screen.getByRole('tab',{name:'Start'})).toBeInTheDocument();
});
it('registry requires exactly one of component or open',()=>{
 const bad:any={id:'x',apiVersion:1,canvasLaunchers:[{id:'x',title:'X'}]};
 expect(()=>createExtensionRegistry([bad],{x:{canvasLaunchers:['x']}})).toThrow('Invalid Canvas launcher');
 const both:any={id:'x',apiVersion:1,canvasLaunchers:[{id:'x',title:'X',component:()=>null,open:async()=>({id:1})}]};
 expect(()=>createExtensionRegistry([both],{x:{canvasLaunchers:['x']}})).toThrow('Invalid Canvas launcher');
});
