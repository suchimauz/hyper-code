import {afterEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {documentationExtension} from '../core-ui/documentation';
const context={agentId:null,theme:'light' as const,readOnly:false};
afterEach(()=>{vi.restoreAllMocks();history.replaceState(null,'','/');});
it('renders transcript snippets as text with only bold markers interpreted',async()=>{
 history.replaceState(null,'','/?view=extension:documentation/search&q=hello&agent=a');
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({hits:[{agentId:'a',idx:1,role:'user',score:2,snippet:'<b>hello</b><img src=x onerror=alert(1)>'}]})));
 const Page=documentationExtension.pages![0].component;const view=render(<Page context={context}/>);
 expect(await screen.findByText('hello')).toBeTruthy();expect(view.container.querySelector('img')).toBeNull();expect(view.container.querySelector('mark')?.textContent).toBe('hello');expect(fetch.mock.calls[0][0]).toBe('/search?q=hello&agent=a');
});
it('renders complete native function documentation without server HTML',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({namespaces:['sample'],docs:[{name:'sample.read',summary:'Read',doc:'Full documentation',optsType:'{path:string}',returnType:'Promise<string>',rel:'sample/read.ts',paramsSchema:{properties:{path:{type:'string',description:'File path'}},required:['path']}}]})));
 const Page=documentationExtension.pages![1].component;const view=render(<Page context={context}/>);
 expect(await screen.findByText('sample.read')).toBeTruthy();expect(screen.getByText('Full documentation')).toBeTruthy();expect(screen.getByText('File path')).toBeTruthy();expect(screen.getByText('Promise<string>')).toBeTruthy();expect(view.container.querySelector('iframe')).toBeNull();
});
