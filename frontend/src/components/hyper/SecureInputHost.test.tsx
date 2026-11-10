import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { requestJson } from '../../lib/hyper';
import { SecureInputHost } from './SecureInputHost';
vi.mock('../../lib/hyper', () => ({ requestJson: vi.fn(async () => ({ inputs: [{id:'s',kind:'secret',title:'Secret',message:'Paste key',saveAs:'secret://test/demo',mode:'password'},{id:'t',kind:'redmine-time',title:'Time'},{id:'r',kind:'redmine-approval',title:'Approve'}] })) }));
afterEach(cleanup);
test('secret renders a native card; only the value field is an isolated frame', async () => {
 const {container}=render(<SecureInputHost agentId="a" />);
 const card=await screen.findByRole('region',{name:'Secret'});
 expect(card.className).toContain('question-card');
 expect(screen.getByText('Paste key')).toBeTruthy();
 expect(screen.getByText('secret://test/demo')).toBeTruthy();
 const frame=card.querySelector('iframe')!;
 expect(frame.getAttribute('src')).toBe('/input/compat?agentId=a&id=s&theme=light&view=field');
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
 expect(frame.hasAttribute('srcdoc')).toBe(false);
 const save=screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement;
 expect(save.disabled).toBe(true);
 window.dispatchEvent(new MessageEvent('message',{origin:'http://evil',data:{source:'hyper-secret',id:'s',state:'ready'}}));
 expect(save.disabled).toBe(true);
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
});
test('other secure kinds open after click; approval uses top-level protected page', async () => {
 const {container}=render(<SecureInputHost agentId="a" />);
 const button=await screen.findByRole('button',{name:/Time/});
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
 fireEvent.click(button);
 const frames=[...container.querySelectorAll('iframe')].map(f=>f.getAttribute('src'));
 expect(frames).toContain('/input/compat?agentId=a&id=t&theme=light');
 const link=screen.getByRole('link');expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('href')).toContain('id=r');
});

test('unapproved arbitrary plugin has visible safe fallback; core native kinds are not duplicated', async () => {
 vi.mocked(requestJson).mockResolvedValueOnce({ inputs: [{id:'x',kind:'example-review',title:'Plugin review'}, ...['choice','confirm','grid','planning-review'].map(kind=>({id:kind,kind,title:kind}))] } as never);
 render(<SecureInputHost agentId="a" />);
 fireEvent.click(await screen.findByRole('button',{name:/Plugin review/}));
 expect(screen.getByTitle('Plugin review').getAttribute('src')).toContain('id=x');
 expect(screen.getByText(/восстановите её плагин/)).toBeTruthy();
 expect(screen.getByText('Ожидают ответа или обработки: 5')).toBeTruthy();
 for(const kind of ['choice','confirm','grid','planning-review']) expect(screen.queryByRole('button',{name:new RegExp(kind)})).toBeNull();
});
