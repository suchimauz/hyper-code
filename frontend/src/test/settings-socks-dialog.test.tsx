import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsDialog, type SettingsTab } from '../components/settings/SettingsDialog';
vi.mock('../components/settings/LlmConnectionsPanel',()=>({LlmConnectionsPanel:()=> <p>LLM panel</p>}));
vi.mock('@mauzcode/ui',async()=>({...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'),requestJson:vi.fn(async()=>({items:[]}))}));
import { requestJson } from '@mauzcode/ui';
function Harness(){const [tab,setTab]=useState<SettingsTab>('llm-connections');return <SettingsDialog open tab={tab} onTab={setTab} onOpenChange={()=>{}} theme="dark"/>;}
test('real Settings dialog opens SOCKS5 registry via navigation and mobile selector',async()=>{
 render(<Harness/>);
 expect(screen.getByText('LLM panel')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'SOCKS5'}));
 expect(await screen.findByText('Прокси пока нет.')).toBeInTheDocument();
 expect(requestJson).toHaveBeenCalledWith('/settings/proxies',expect.objectContaining({signal:expect.any(AbortSignal)}));
 fireEvent.click(screen.getByRole('button',{name:'Добавить прокси'}));
 expect(screen.getByLabelText('Метка')).toHaveFocus();
 expect(screen.getByLabelText('IP или DNS-имя')).toBeEnabled();
 fireEvent.change(screen.getByLabelText('Раздел настроек'),{target:{value:'llm-connections'}});
 expect(screen.queryByLabelText('IP или DNS-имя')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Раздел настроек'),{target:{value:'socks-proxies'}});
 expect(await screen.findByText('Прокси пока нет.')).toBeInTheDocument();
 expect(screen.queryByLabelText('IP или DNS-имя')).not.toBeInTheDocument();
});

test.each(['light', 'dark'] as const)('native settings form supports keyboard submit and cancellation in %s theme', async theme => {
 const user = (await import('@testing-library/user-event')).default.setup();
 const request = vi.mocked(requestJson);
 request.mockClear();
 render(<SettingsDialog open tab="socks-proxies" onTab={()=>{}} onOpenChange={()=>{}} theme={theme}/>);
 await screen.findByText('Прокси пока нет.');
 await user.click(screen.getByRole('button', {name:'Добавить прокси'}));
 await user.type(screen.getByLabelText('Метка'), 'Desk');
 await user.tab();
 expect(screen.getByLabelText('IP или DNS-имя')).toHaveFocus();
 await user.paste('[2001:db8::1]:1080:user:pass:word');
 expect(screen.getByLabelText('Пароль')).toHaveValue('pass:word');
 await user.click(screen.getByLabelText('Порт'));
 await user.keyboard('{Enter}');
 await screen.findByText('Прокси пока нет.');
 expect(request).toHaveBeenCalledWith('/settings/proxies', expect.objectContaining({method:'POST',body:{action:'add',name:'Desk',host:'2001:db8::1',port:1080,auth:true,username:'user',password:'pass:word'}}));
 await user.click(screen.getByRole('button', {name:'Добавить прокси'}));
 expect(screen.getByLabelText('Метка')).toHaveValue('');
 await user.click(screen.getByRole('button', {name:'Отмена'}));
 expect(screen.getByRole('button', {name:'Добавить прокси'})).toHaveFocus();
 expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
});
