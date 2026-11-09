import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasPanel } from '../components/hyper/CanvasPanel';
import { parseCanvasTabs } from '../components/hyper/canvasTabs';
vi.mock('../components/hyper/CanvasTerminal', () => ({ CanvasTerminal: ({ active }: { active: boolean }) => <div hidden={!active}>Terminal content</div> }));
const props = {agentId:'a', revision:'1', theme:'light' as const, onClose:vi.fn(), expanded:false, onExpand:vi.fn()};
const tab = {id:12,title:'File <unsafe>',icon:'file-text',active:true};
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();vi.useRealTimers();});
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
it('validates tab metadata instead of parsing HTML',()=>{
 expect(()=>parseCanvasTabs({items:[{...tab,id:'12'}]})).toThrow();expect(()=>parseCanvasTabs('<div>')).toThrow();
 expect(parseCanvasTabs({items:[tab]})).toEqual([tab]);
});
