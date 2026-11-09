import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { visualizationsExtension } from '../ui-plugins/visualizations';
const context={agentId:null,theme:'light' as const,readOnly:false};
afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState(null,'','/');});
it('renders calendar data as text, permits only explicit safe links, never writes or embeds HTML',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({events:[{id:'1',account:'me',calendarId:'primary',calendar:'Work',summary:'Meeting',start:'2026-07-01',end:'2026-07-02',allDay:true,description:'<script>bad()</script>',htmlLink:'javascript:bad()',meetLink:'https://meet.google.com/abc'}],errors:[]})));
 const Page=visualizationsExtension.pages![0].component; const view=render(<Page context={context}/>);
 expect(await screen.findByText('Meeting')).toBeTruthy();expect(view.container.querySelector('iframe,script')).toBeNull();expect(screen.queryByText('Открыть в Google Calendar ↗')).toBeNull();expect(screen.getByText('Присоединиться к встрече ↗')).toHaveAttribute('rel','noopener noreferrer');expect(fetch.mock.calls[0][1]?.method).toBe('GET');
});
it('shows accessible module dependencies and filters them without a new request',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({graph:{nodes:[{id:'alpha',functions:2,roots:['core'],entryPoints:1,incoming:0,outgoing:1},{id:'beta',functions:1,roots:['plugin'],entryPoints:0,incoming:1,outgoing:0}],edges:[{source:'alpha',target:'beta',weight:2,samples:[]}],cycles:[['alpha','beta']],totals:{cycles:1}},boundary:{total:1,violations:[{caller:'alpha.run',callee:'beta.run'}]}})));
 const Page=visualizationsExtension.pages![1].component;const view=render(<Page context={context}/>);
 expect(await screen.findByRole('button',{name:'alpha · 2 · Цикл'})).toBeTruthy();expect(screen.getByRole('table')).toHaveTextContent('Граница');fireEvent.change(screen.getByLabelText('Найти модуль'),{target:{value:'absent'}});expect(screen.getByText('Модули не найдены.')).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);expect(view.container.querySelector('iframe')).toBeNull();
});
it('reports authorization failure without retry',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:'denied'}),{status:403}));const Page=visualizationsExtension.pages![0].component;render(<Page context={context}/>);expect(await screen.findByRole('alert')).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);
});
it('registers native calendar and both architecture canvas kinds; read-only state never writes',async()=>{
 expect(visualizationsExtension.canvasKinds?.map(x=>x.kind)).toEqual(['gcal.calendar','architectureMap.map','architectureMap.turbulence']);
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({events:[],errors:[]})));
 const Canvas=visualizationsExtension.canvasKinds![0].component;
 render(<Canvas context={{...context,agentId:'owner',readOnly:true}} item={{id:42,kind:'gcal.calendar',args:{date:'2026-07-01'},state:{}}}/>);
 await screen.findByText('На этот день событий нет.');
 expect(String(fetch.mock.calls[0][0])).toContain('agentId=owner&itemId=42');
 fireEvent.click(screen.getByLabelText('Следующий день'));
 await screen.findByText('На этот день событий нет.');
 expect(fetch.mock.calls.every(call=>call[1]?.method==='GET')).toBe(true);
});
