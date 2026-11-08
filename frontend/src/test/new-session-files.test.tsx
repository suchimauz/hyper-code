import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { NewSessionComposer } from '../components/hyper/NewSessionComposer';
import { type NewSessionDraft, submitNewSession } from '../lib/newSession';
vi.mock('../components/hyper/ModelPicker', () => ({ ModelPicker: ({ onReadyChange }: { onReadyChange: (ready:boolean)=>void }) => { useEffect(() => onReadyChange(true), [onReadyChange]); return null; } }));
vi.mock('../components/hyper/CrabMascot', () => ({ CrabMascot: () => null }));
vi.mock('../lib/newSession', async original => ({ ...await original<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ csrfToken:'token' })), submitNewSession: vi.fn() }));
const created = vi.fn();
function Draft() { const [draft,onChange]=useState<NewSessionDraft>({projectId:'p',model:'test:model',effort:'',text:'',requestKey:crypto.randomUUID()}); return <NewSessionComposer draft={draft} onChange={onChange} projects={[{id:'p',title:'Project',dir:'/',host:null,chats:[]}]} onCreated={created} onPending={()=>{}} />; }
afterEach(()=>{sessionStorage.clear(); vi.clearAllMocks();});
it('sends files without text and keeps the same immutable files for uncertain retry',async()=>{
 vi.mocked(submitNewSession).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({agentId:'mock',projectId:'p',status:'sent'});
 const {container}=render(<Draft/>); const file=new File(['hello'],'note.txt',{type:'text/plain'});
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[file]}});
 fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
 await screen.findByRole('alert');
 expect(screen.getByRole('button',{name:'Добавить'})).toBeDisabled();
 expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({text:'',fileCount:1}),'token',[file]);
 fireEvent.click(screen.getByText('Повторить отправку'));
 await waitFor(()=>expect(created).toHaveBeenCalledWith('mock'));
 expect(vi.mocked(submitNewSession).mock.calls[1]).toEqual(vi.mocked(submitNewSession).mock.calls[0]);
});
it('a reloaded file submission cannot be retried as text-only',()=>{
 sessionStorage.setItem('hyper-ui-new-session-pending',JSON.stringify({projectId:'p',model:'test:model',effort:'',text:'keep',requestKey:'missing-after-reload',fileCount:1}));
 render(<Draft/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Повтор заблокирован');
 expect(screen.queryByText('Повторить отправку')).not.toBeInTheDocument();
 fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
 expect(submitNewSession).not.toHaveBeenCalled();
});
it('keeps the empty composer one-line without an empty attachment rail',()=>{
 const {container}=render(<Draft/>);
 expect(container.querySelector('.pending-attachments')).toBeNull();
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'note.txt')]}});
 expect(container.querySelector('.pending-attachments')).not.toBeNull();
});
it('rejects excess attachments before any creation request',()=>{
 const {container}=render(<Draft/>);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:Array.from({length:11},(_,i)=>new File(['x'],`${i}.txt`))}});
 expect(screen.getByRole('alert')).toHaveTextContent('Не более 10 файлов');
 fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
 expect(submitNewSession).not.toHaveBeenCalled();
});
