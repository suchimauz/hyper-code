import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {PeoplePage} from '../components/PeoplePage';
import {SidebarDraftPage} from '../components/SidebarDraftPage';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('People reads protected JSON and renders account labels without HTML injection',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({meId:'me',csrfToken:'csrf',google:null,users:[{id:'me',name:'<script>bad</script>',email:'me@test',role:'owner',disabledAt:null,hasPassword:true,providers:[]}]})));vi.stubGlobal('fetch',fetcher);render(<PeoplePage/>);expect(await screen.findByText('<script>bad</script>')).toBeTruthy();expect(screen.getByRole('button',{name:'Add person'})).toBeTruthy();expect(fetcher.mock.calls[0][0]).toBe('/auth/users');
});
it('draft creates nothing on mount and blocks duplicate first-send clicks',async()=>{
 let finish:(v:Response)=>void=()=>{};const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({title:'Tab',model:'mock:model',state:'draft',csrfToken:'csrf',chats:[]}))).mockImplementationOnce(()=>new Promise<Response>(r=>{finish=r;}));vi.stubGlobal('fetch',fetcher);const onCreated=vi.fn();render(<SidebarDraftPage bindingId="binding" onCreated={onCreated}/>);
 const button=await screen.findByRole('button',{name:'Send and create chat'});expect(fetcher).toHaveBeenCalledTimes(1);fireEvent.change(screen.getByLabelText('First message'),{target:{value:'hello'}});fireEvent.click(button);fireEvent.click(button);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf');finish(new Response(JSON.stringify({agentId:'ab'})));await waitFor(()=>expect(onCreated).toHaveBeenCalledWith('ab'));
});
