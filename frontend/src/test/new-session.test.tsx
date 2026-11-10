import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { NewSessionComposer } from '../components/mauzcode/NewSessionComposer';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';
import { readNewSessionDraft, type NewSessionDraft } from '../lib/newSession';
import { ApiError } from '../lib/mauzcode';
import { useMauzCode } from '../hooks/useMauzCode';
vi.mock('../components/mauzcode/ModelPicker', () => ({ ModelPicker: ({ draft, onReadyChange }: { draft: { onChange: (m:string,e:string)=>void }; onReadyChange?: (ready: boolean) => void }) => { useEffect(() => { onReadyChange?.(true); }, [onReadyChange]); return <button onClick={() => draft.onChange('test:chosen','high')}>Choose model</button>; } }));
vi.mock('../components/mauzcode/CrabMascot', () => ({ CrabMascot: () => null }));
vi.mock('../lib/newSession', async importOriginal => ({ ...await importOriginal<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ defaultModel:'test:default',csrfToken:'token' })), submitNewSession: vi.fn() }));
vi.mock('../lib/live', () => ({ loadLiveClient: async () => {} }));
const projects = [{id:'p1',title:'First',dir:'/first',host:null,chats:[]}];
const created = vi.fn();
const initial: NewSessionDraft = { projectId:'p1',model:'test:default',effort:'',text:'',requestKey:'initial' };
function Draft() { const [draft,setDraft] = useState(initial); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
afterEach(() => { sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); history.replaceState(null,'','/'); });
it('typing and model selection stay local; first send creates once with the selected settings', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'zz',projectId:'p1',status:'sent'});
  render(<Draft />);
  fireEvent.click(screen.getByText('Choose model'));
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  expect(submitNewSession).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(submitNewSession).toHaveBeenCalledTimes(1);
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({text:'Hello',projectId:'p1',model:'test:chosen',effort:'high'}),'token');
});
it('uncertain retry reuses the exact immutable payload and request key', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce({agentId:'zz',projectId:'p1',status:'sent'});
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}}); fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByRole('alert'); expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  fireEvent.click(screen.getByText('Повторить отправку'));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toEqual(vi.mocked(submitNewSession).mock.calls[1][0]);
});
it('validation failure keeps text editable without creating a replacement agent', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValue(new ApiError('Invalid workspace',400));
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Keep me'}}); fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByRole('alert'); expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'true'); expect(screen.getByRole('textbox')).toHaveTextContent('Keep me'); expect(created).not.toHaveBeenCalled();
});
it('a draft has a request key but no agent id', () => { expect(readNewSessionDraft()).not.toHaveProperty('agentId'); expect(readNewSessionDraft().requestKey).toBeTruthy(); });
it('New Session action shows a local row without an agent id in its workspace', () => {
  const onNewSession=vi.fn();
  render(<WorkspaceSidebar projects={projects} selected="" draftProjectId="p1" onNewSession={onNewSession} user={null} theme="light" onTheme={()=>{}} onToggle={()=>{}} onSelect={()=>{}} onRetry={()=>{}} />);
  expect(screen.getByRole('button',{name:'First'})).toHaveAttribute('aria-expanded','true');
  const buttons=screen.getAllByRole('button',{name:'New Session'}); expect(buttons).toHaveLength(2); fireEvent.click(buttons[0]); expect(onNewSession).toHaveBeenCalledOnce();
});
it('an empty selection never fetches agent events or auto-selects a pre-existing agent', async () => {
  const fetcher=vi.fn(async () => new Response(JSON.stringify({agents:[{id:'existing'}]}),{headers:{'content-type':'application/json'}})); vi.stubGlobal('fetch',fetcher);
  function State(){ const mauzcode=useMauzCode(); return <span data-testid="selected">{mauzcode.selected || 'draft'}</span>; }
  render(<State/>); await waitFor(()=>expect(fetcher).toHaveBeenCalled());
  expect(screen.getByTestId('selected')).toHaveTextContent('draft');
  expect(fetcher.mock.calls.every(args=> !String((args as unknown[])[0]).includes('/events'))).toBe(true);
});
it('catalog failure keeps a slash draft editable and never creates a session', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'catalog offline' }), { status: 503, headers: { 'content-type': 'application/json' } })));
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'), { target: { textContent: '/plan task' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Ввод сообщения' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('catalog offline');
  expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'true'); expect(screen.getByRole('textbox')).toHaveTextContent('/plan task');
  expect(submitNewSession).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('mauzcode-ui-new-session-pending')).toBeNull();
});
