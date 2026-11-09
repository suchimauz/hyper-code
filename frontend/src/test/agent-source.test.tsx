import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentSource } from '../core-ui/agent-source';
import { readNewSessionDraft } from '../lib/newSession';
afterEach(()=>{vi.unstubAllGlobals();history.replaceState(null,'','/');sessionStorage.clear();localStorage.clear();});
it('renders source content literally through the read-only JSON route',async()=>{
 history.replaceState(null,'','/?sourceAgent=a&sourceIndex=2');
 const fetch=vi.fn(async()=>new Response(JSON.stringify({agentId:'a',index:2,role:'user',content:'<img src=x onerror=bad>'}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 const {container}=render(<AgentSource/>);
 expect(await screen.findByText('<img src=x onerror=bad>')).toBeTruthy();expect(container.querySelector('img')).toBeNull();
 expect(fetch.mock.calls.length).toBe(1);expect(screen.getByText('Open source chat').getAttribute('href')).toBe('/?agent=a');
});
it('legacy new-session links preselect project/model without sending',()=>{
 history.replaceState(null,'','/?newSession=1&projectId=p&model=test%3Am&effort=high');
 expect(readNewSessionDraft()).toMatchObject({projectId:'p',model:'test:m',effort:'high',text:''});
});
