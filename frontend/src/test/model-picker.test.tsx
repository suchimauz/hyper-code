import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelPicker } from '../components/mauzcode/ModelPicker';
import type { ModelSettings } from '../lib/models';
const icon = { src: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', custom: false };
const original: ModelSettings = { agentId:'fixture', model:'openai:gpt-5', label:'gpt-5', icon, models:[{provider:'openai',model:'openai:gpt-4',label:'gpt-4',icon,disabled:false},{provider:'openai',model:'openai:gpt-3',label:'gpt-3',icon,disabled:false},{provider:'openai',model:'openai:gpt-5',label:'gpt-5',icon,disabled:false},{provider:'remote',model:'ssh/host:anthropic:claude',label:'claude',icon,disabled:false},{provider:'remote',model:'disabled',label:'Disabled model',icon:null,disabled:true}],effort:{requested:'high',applied:'high',supported:['low','medium','high'],mode:'openai-effort'} };
const json = (body: object, status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const props = {agentId:'fixture',running:false,busy:false,revision:0,onSaved:vi.fn(),onBusyChange:vi.fn()};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('opens dsh-style two-step grouped search, uses full model route, closes only after native save',async()=>{
 let state=structuredClone(original);
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){const {model}=JSON.parse(init.body as string);state={...state,model,label:'claude'};return json({ok:true,model});}
  return json(state);
 });vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: gpt-5'});
 expect(trigger.querySelector('.navigation-provider-icon')).not.toBeNull();
 await userEvent.click(trigger);await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.getByRole('menuitemradio',{name:'Disabled model'})).toBeDisabled();
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'claude');
 expect(screen.queryByRole('menuitemradio',{name:'gpt-5'})).toBeNull();
 await userEvent.click(screen.getByRole('menuitemradio',{name:'claude'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 const post=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(post?.[0]).toBe('/api/v1/agents/fixture/model');expect(JSON.parse(post![1]!.body as string)).toEqual({model:'ssh/host:anthropic:claude'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.getByRole('button',{name:'Выбрать модель: claude'})).toHaveFocus();
});
it('keeps menu on native failure; keyboard Escape returns root then restores trigger',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?json({message:'Agent is running'},400):json(original)));
 render(<ModelPicker {...props}/>);const trigger=await screen.findByRole('button',{name:'Выбрать модель: gpt-5'});
 await userEvent.click(trigger);await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 await userEvent.click(screen.getByRole('menuitemradio',{name:'claude'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Agent is running');expect(props.onSaved).not.toHaveBeenCalled();
 await userEvent.keyboard('{Escape}');expect(screen.getByRole('menuitem',{name:/Model gpt-5/})).toBeVisible();
 await userEvent.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(trigger).toHaveFocus();
});
it('uses native effort values and hides unsupported controls',async()=>{
 let state=structuredClone(original);
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith('/effort')){expect((init?.body as FormData).get('effort')).toBe('low');state.effort.requested='low';state.effort.applied='low';return new Response(null,{status:204});}return json(state);
 });vi.stubGlobal('fetch',fetcher);
 const view=render(<ModelPicker {...props}/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:'Effort High'}));await userEvent.click(screen.getByRole('menuitemradio',{name:'Low'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 view.unmount();state={...state,effort:{requested:'auto',applied:'off',supported:[],mode:'none'}};
 render(<ModelPicker {...props}/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5'}));
 expect(screen.queryByRole('menuitem',{name:/Effort/})).toBeNull();
});
it('allows inspection while running but prevents mutations',async()=>{
 const fetcher=vi.fn(async()=>json(original));vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props} running/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));expect(screen.getByRole('menuitemradio',{name:'claude'})).toBeDisabled();
 expect(screen.getByText('Смена доступна после завершения ответа.')).toBeVisible();expect(props.onSaved).not.toHaveBeenCalled();
});

it('keeps draft model and effort local without agent writes', async () => {
 const fetcher = vi.fn(async () => json({ ...original, defaultModel: original.model })); vi.stubGlobal('fetch', fetcher);
 const onChange = vi.fn();
 const view = render(<ModelPicker draft={{ model: original.model, effort: 'high', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'claude' }));
 expect(onChange).toHaveBeenLastCalledWith('ssh/host:anthropic:claude', 'high');
 view.rerender(<ModelPicker draft={{ model: 'ssh/host:anthropic:claude', effort: 'high', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: claude' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: 'Effort High' }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'Low' }));
 expect(onChange).toHaveBeenLastCalledWith('ssh/host:anthropic:claude', 'low');
 expect(fetcher.mock.calls.every(call => !((call as unknown as [string, RequestInit?])[1]?.method))).toBe(true);
 expect(fetcher.mock.calls.every(call => !(call as unknown as [string])[0].includes('agentId='))).toBe(true);
 expect(props.onSaved).not.toHaveBeenCalled();
});


it('reports draft config errors and retries using a read-only model projection', async () => {
 let failing = true;
 const fetcher = vi.fn(async () => failing ? json({ message: 'Config unavailable' }, 503) : json({ ...original, defaultModel: original.model }));
 vi.stubGlobal('fetch', fetcher);
 render(<ModelPicker draft={{ model: original.model, effort: 'low', onChange: vi.fn() }} />);
 await userEvent.click(screen.getByRole('button', { name: 'Выбрать модель: Model' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('Config unavailable');
 failing = false;
 await userEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
 expect(await screen.findByRole('menuitem', { name: /Model gpt-5/ })).toBeEnabled();
 expect(screen.queryByRole('alert')).toBeNull();
 const url = new URL((fetcher.mock.calls[0] as unknown as [string])[0], 'http://localhost');
 expect(url.pathname).toBe('/ui-lab-api/new-session');
 expect(url.searchParams.get('model')).toBeNull(); // catalogue first, so removed remembered models recover
 expect(url.searchParams.get('effort')).toBeNull();
});

it('shows and searches proxy account groups while saving the original OAuth route',async()=>{
 let state=structuredClone(original);
 const model='anthropic-oauth/work:opus';
 state.models.push({provider:'anthropic-oauth',model,label:'opus',groupLabel:'socks5 · Office proxy · claude/work',disabled:false,icon:null});
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){state={...state,model:JSON.parse(init.body as string).model,label:'opus'};return json({ok:true,model});}
  return json(state);
 });
 vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.getByRole('group',{name:'socks5 · Office proxy · claude/work'})).toBeVisible();
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'Office proxy');
 expect(screen.queryByRole('menuitemradio',{name:'gpt-5'})).toBeNull();
 await userEvent.click(screen.getByRole('menuitemradio',{name:'opus'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 const post=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(JSON.parse(post![1]!.body as string)).toEqual({model});
});
