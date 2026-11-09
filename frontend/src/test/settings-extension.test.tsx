import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { settingsExtension } from '../ui-plugins/settings';
vi.mock('@hyper/ui', async () => { const actual = await vi.importActual<typeof import('@hyper/ui')>('@hyper/ui'); return {...actual, requestJson:vi.fn()}; });
import { requestJson } from '@hyper/ui';
const request=vi.mocked(requestJson);
const context={agentId:null,theme:'light' as const,readOnly:false};
const Declared=settingsExtension.pages![1].component;
const Overview=settingsExtension.pages![0].component;
beforeEach(()=>request.mockReset());
describe('native settings extension',()=>{
 it('registers overview and declared without HTML transport',()=>{expect(settingsExtension.id).toBe('settings');expect(settingsExtension.pages!.map(p=>p.id)).toEqual(['overview','declared']);});
 it('renders secret as empty password, file setting read-only and saves a typed number',async()=>{
 request.mockResolvedValue({items:[{module:'test',key:'secret',type:'secret',configured:true,source:'db'},{module:'test',key:'count',type:'number',value:3,source:'db',min:1,max:9},{module:'test',key:'fixed',type:'text',value:'locked',source:'file',path:'/instance.json'}]});
 render(<Declared context={context}/>);
 const password=await screen.findByLabelText('secret');expect(password).toHaveAttribute('type','password');expect(password).toHaveValue('');expect(screen.getByText('/instance.json')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('count'),{target:{value:'7'}});fireEvent.submit(screen.getByLabelText('count').closest('form')!);
 await waitFor(()=>expect(request).toHaveBeenCalledWith('/settings/declared',expect.objectContaining({method:'POST',body:{action:'save',name:'test.count',value:7}})));
 });
 it('read-only context disables all mutations',async()=>{request.mockResolvedValue({items:[{module:'test',key:'count',type:'number',value:3,source:'db'}]});render(<Declared context={{...context,readOnly:true}}/>);await screen.findByLabelText('count');expect(screen.getByRole('button',{name:'Сохранить'})).toBeDisabled();expect(screen.getByRole('button',{name:'Сбросить'})).toBeDisabled();});
 it('provider keys are never prefilled and clear after submission',async()=>{
 const snapshot={status:{openai:{set:true},anthropic:{set:false},kimi:{set:false},groq:{set:false},openrouter:{set:false},kimiCoding:{loggedIn:false},codex:{loggedIn:false}},flows:{kimi:{status:'idle'},codex:{status:'idle'}}};request.mockResolvedValue(snapshot);render(<Overview context={context}/>);
 const input=await screen.findByLabelText('OpenAI');expect(input).toHaveValue('');fireEvent.change(input,{target:{value:'new-key'}});fireEvent.submit(input.closest('form')!);
 await waitFor(()=>expect(request).toHaveBeenCalledWith('/settings/env',expect.objectContaining({method:'POST',body:{action:'env',key:'OPENAI_API_KEY',value:'new-key'}})));
 await waitFor(()=>expect(input).toHaveValue(''));
 });
});
