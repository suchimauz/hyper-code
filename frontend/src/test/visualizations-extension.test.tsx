import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { visualizationsExtension } from '../ui-plugins/visualizations';
const context={agentId:null,theme:'light' as const,readOnly:false};
afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState(null,'','/');});
it('shows accessible module dependencies and filters them without a new request',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({graph:{nodes:[{id:'alpha',functions:2,roots:['core'],entryPoints:1,incoming:0,outgoing:1},{id:'beta',functions:1,roots:['plugin'],entryPoints:0,incoming:1,outgoing:0}],edges:[{source:'alpha',target:'beta',weight:2,samples:[]}],cycles:[['alpha','beta']],totals:{cycles:1}},boundary:{total:1,violations:[{caller:'alpha.run',callee:'beta.run'}]}})));
 const Page=visualizationsExtension.pages![0].component;const view=render(<Page context={context}/>);
 expect(await screen.findByRole('button',{name:'alpha · 2 · Цикл'})).toBeTruthy();expect(screen.getByRole('table')).toHaveTextContent('Граница');fireEvent.change(screen.getByLabelText('Найти модуль'),{target:{value:'absent'}});expect(screen.getByText('Модули не найдены.')).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);expect(view.container.querySelector('iframe')).toBeNull();
});
it('reports authorization failure without retry',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:'denied'}),{status:403}));const Page=visualizationsExtension.pages![0].component;render(<Page context={context}/>);expect(await screen.findByRole('alert')).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);
});
it('registers both architecture canvas kinds',()=>{
 expect(visualizationsExtension.canvasKinds?.map(x=>x.kind)).toEqual(['architectureMap.map','architectureMap.turbulence']);
});
