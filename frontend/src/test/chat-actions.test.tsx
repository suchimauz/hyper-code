import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, renderHook, act } from '@testing-library/react';
import { WorkspaceSidebar } from '../components/hyper/WorkspaceSidebar';
import { LiveComposer } from '../components/hyper/LiveComposer';
import { filterProjects, updateChat, type NavigationProject } from '../lib/navigation';
import { useNavigation } from '../hooks/useNavigation';
const projects: NavigationProject[] = [{id:'project',title:'Workspace',dir:'/test',host:null,chats:[
 {id:'a',title:'Newer',model:'m',runState:'idle',hasUnread:false,lastReplyAt:20},
 {id:'b',title:'Pinned',model:'m',runState:'idle',hasUnread:false,lastReplyAt:10,pinned:true,pinnedAt:5},
 {id:'old',title:'Archived',model:'m',runState:'idle',hasUnread:false,lastReplyAt:5,archived:true},
]}];
const props={projects,user:null,selected:'a',theme:'light' as const,onTheme:vi.fn(),onToggle:vi.fn(),onSelect:vi.fn(),onRetry:vi.fn(),onAction:vi.fn()};
const json=(body:object,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();vi.clearAllMocks();});
it('sorts pinned first and action buttons never open the chat',()=>{
 expect(filterProjects(projects,'',false)[0].chats.map(c=>c.id)).toEqual(['b','a']);
 render(<WorkspaceSidebar {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Закрепить чат a'}));expect(props.onAction).toHaveBeenCalledWith('a','pin');expect(props.onSelect).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Открепить чат b'}));expect(props.onAction).toHaveBeenCalledWith('b','unpin');
 fireEvent.click(screen.getByRole('button',{name:'Архивировать чат a'}));expect(props.onAction).toHaveBeenCalledWith('a','archive');
 expect(document.querySelector('button button')).toBeNull();
});
it('shares workspace expansion between active/archive and shows only restore in archive',()=>{
 render(<WorkspaceSidebar {...props}/>);const heading=screen.getByRole('button',{name:'Workspace'});
 fireEvent.click(heading);fireEvent.click(screen.getByRole('button',{name:'Archived'}));expect(heading).toHaveAttribute('aria-expanded','false');
 fireEvent.click(heading);expect(screen.getByRole('button',{name:'Разархивировать чат old'})).toBeVisible();
 expect(screen.queryByRole('button',{name:'Закрепить чат old'})).toBeNull();expect(screen.queryByRole('button',{name:'Архивировать чат old'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Разархивировать чат old'}));expect(props.onAction).toHaveBeenCalledWith('old','restore');
 fireEvent.click(screen.getByRole('button',{name:'Active'}));expect(heading).toHaveAttribute('aria-expanded','true');
});
it('uses native personal pin/archive/restore routes',async()=>{
 const fetcher=vi.fn(async()=>json({ok:true}));vi.stubGlobal('fetch',fetcher);
 await updateChat('a','pin');await updateChat('a','unpin');await updateChat('a','archive');await updateChat('a','restore');
 expect(fetcher.mock.calls.map(c=>(c as unknown as [string])[0])).toEqual(['/api/v1/agents/a/pin','/api/v1/agents/a/pin','/api/v1/agents/a/archive','/agent/a/unarchive']);
});
it('keeps sidebar unchanged on conflict and applies archive/restore only after acknowledgement',async()=>{
 let fail=true;const fetcher=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST' ? fail?json({message:'Agent busy'},409):json({ok:true}):url==='/auth/session'?json({user:null}):json({projects}));vi.stubGlobal('fetch',fetcher);
 const view=renderHook(()=>useNavigation());await waitFor(()=>expect(view.result.current.projects).toHaveLength(1));
 await act(async()=>{await view.result.current.act('a','archive');});expect(view.result.current.actionError).toBe('Agent busy');expect(view.result.current.projects[0].chats[0].archived).not.toBe(true);
 fail=false;await act(async()=>{await view.result.current.act('a','archive');});expect(fetcher).toHaveBeenCalled();
});
it('archived composer disables typing, sending and all footer buttons without discarding draft',async()=>{
 sessionStorage.setItem('hyper-ui-draft:a',JSON.stringify({text:'draft',key:'saved'}));
 const fetcher=vi.fn(async()=>json({budget:null,models:[]}));vi.stubGlobal('fetch',fetcher);
 const view=render(<LiveComposer agentId="a" running={false} readOnly onAccepted={vi.fn()}/>);
 const input=screen.getByRole('textbox');expect(input).toHaveAttribute('contenteditable','false');expect(input).toHaveAttribute('aria-disabled','true');expect(input).toHaveTextContent('draft');
 for(const button of view.container.querySelectorAll('button')) expect(button).toBeDisabled();
 fireEvent.submit(view.container.querySelector('form')!);await waitFor(()=>expect(fetcher.mock.calls.length).toBeGreaterThan(0));
 expect(fetcher.mock.calls.some(call=>String((call as unknown as [string])[0])==='/agent/a')).toBe(false);
 view.rerender(<LiveComposer agentId="a" running={false} onAccepted={vi.fn()}/>);expect(input).toHaveAttribute('contenteditable','true');expect(input).toHaveTextContent('draft');sessionStorage.clear();
});
