import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionCard } from '../components/hyper/QuestionCard';
import { ConnectedQuestionCard } from '../components/hyper/ConnectedQuestionCard';
import { choiceEpisode, choiceAnswer, clearChoiceDraft, type ChoiceInput } from '../lib/questions';
// Secure kinds have independent transport coverage in SecureInputHost.test.tsx.
vi.mock('../components/hyper/SecureInputHost', () => ({ SecureInputHost: () => null }));
const input: ChoiceInput = { id:'q', agentId:'a', kind:'choice', title:'Which?', state:'open', spec:{options:[{value:'stable-a',label:'Alpha (Recommended)',description:'Details'}, {value:'stable-b',label:'Beta'}],allowOther:true} };
afterEach(() => { cleanup(); clearChoiceDraft('a','q'); vi.restoreAllMocks(); });
function card(item = input) { const submit = vi.fn(); render(<QuestionCard input={item} onSubmit={submit}/>); return submit; }
describe('ordinary choice card', () => {
  it('keeps Other hidden until selected, requires text, excludes retained draft on deselect', () => {
    const submit = card(); expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Другое/)); fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Напишите'); expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'retained'}});
    fireEvent.click(screen.getByLabelText(/Alpha/)); expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Отправить'})); expect(submit).toHaveBeenLastCalledWith({value:'stable-a',otherSelected:false});
    fireEvent.click(screen.getByLabelText(/Другое/)); expect(screen.getByRole('textbox')).toHaveValue('retained');
    fireEvent.click(screen.getByRole('button',{name:'Отправить'})); expect(submit).toHaveBeenLastCalledWith({otherSelected:true,other:'retained'});
  });
  it('multi Other is additive and deselection retains text without sending it', () => {
    const submit = card({...input,spec:{...input.spec,multiple:true}});
    fireEvent.click(screen.getByLabelText(/Alpha/)); fireEvent.click(screen.getByLabelText(/Другое/)); fireEvent.change(screen.getByRole('textbox'),{target:{value:'extra'}});
    fireEvent.click(screen.getByRole('button',{name:'Отправить'})); expect(submit).toHaveBeenLastCalledWith({values:['stable-a'],otherSelected:true,other:'extra'});
    fireEvent.click(screen.getByLabelText(/Другое/)); fireEvent.click(screen.getByRole('button',{name:'Отправить'})); expect(submit).toHaveBeenLastCalledWith({values:['stable-a'],otherSelected:false});
  });
  it('isolates drafts by input and agent across remounts', () => {
    card(); fireEvent.click(screen.getByLabelText(/Другое/)); fireEvent.change(screen.getByRole('textbox'),{target:{value:'private'}}); cleanup();
    card({...input,agentId:'b'}); expect(screen.queryByRole('textbox')).toBeNull(); cleanup();
    card({...input,id:'second'}); expect(screen.queryByRole('textbox')).toBeNull(); cleanup();
    card(); expect(screen.getByRole('textbox')).toHaveValue('private');
  });
  it('does not serialize an unselected Other or unknown option', () => {
    expect(choiceAnswer(input,{values:['stable-b','not-present'],otherSelected:false,other:'secret'})).toEqual({value:'stable-b',otherSelected:false});
    expect(() => choiceAnswer(input,{values:[],otherSelected:false,other:'secret'})).toThrow();
  });
  it('locks all controls while sending', () => {
    render(<QuestionCard input={input} busy onSubmit={vi.fn()}/>); expect(screen.getByLabelText(/Другое/)).toBeDisabled(); expect(screen.getByRole('button')).toBeDisabled();
  });
});
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}); }
it('uses owner API, retries draft after errors and does not send double-click duplicates', async () => {
  let attempts = 0;
  const fetcher = vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,init) => {
    if (init?.method === 'POST') { attempts++; return response(attempts === 1 ? {error:'try again'} : {state:'submitted'},attempts === 1 ? 500 : 200); }
    return response({inputs:[input],csrfToken:'csrf'});
  });
  render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
  fireEvent.click(await screen.findByLabelText(/Alpha/)); fireEvent.click(screen.getByRole('button',{name:'Отправить'})); fireEvent.click(screen.getByText('Отправляем…'));
  await waitFor(() => expect(screen.getByRole('button',{name:'Отправить'})).toBeEnabled()); expect(attempts).toBe(1);
  expect(screen.getByLabelText(/Alpha/)).toBeChecked(); fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
  await screen.findByText('Composer'); expect(attempts).toBe(2);
  const post = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(post[0]).toBe('/ui-lab-api/choices?agentId=a'); expect(JSON.parse(post[1]!.body as string)).toEqual({id:'q',value:'stable-a',otherSelected:false});
});
it('closed race follows authoritative state after 409', async () => {
  let posted = false;
  vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,init) => { if (init?.method === 'POST') { posted = true; return response({state:'submitted',error:'Already closed'},409); } return response({inputs:[{...input,state:posted ? 'submitted' : 'open'}],csrfToken:'csrf'}); });
  render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
  fireEvent.click(await screen.findByLabelText(/Alpha/)); fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
  await screen.findByText('Composer'); expect(screen.queryByLabelText(/Alpha/)).toBeNull();
});
it('processing conflict retains draft and permits retry after the server reopens', async () => {
  let posted = false;
  vi.spyOn(globalThis,'fetch').mockImplementation(async (_url,init) => { if (init?.method === 'POST') { posted = true; return response({state:'processing',error:'Processing'},409); } return response({inputs:[{...input,state:'open'}],csrfToken:'csrf'}); });
  render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
  fireEvent.click(await screen.findByLabelText(/Другое/)); fireEvent.change(screen.getByRole('textbox'),{target:{value:'keep me'}}); fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
  await waitFor(() => expect(screen.getByRole('button',{name:'Отправить'})).toBeEnabled()); expect(posted).toBe(true); expect(screen.getByRole('textbox')).toHaveValue('keep me');
});
it('minimizes to a compact question without discarding the draft', async () => {
  vi.spyOn(globalThis,'fetch').mockResolvedValue(response({inputs:[input],csrfToken:'csrf'}));
  render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
  fireEvent.click(await screen.findByLabelText(/Другое/)); fireEvent.change(screen.getByRole('textbox'),{target:{value:'retained'}});
  fireEvent.click(screen.getByLabelText('Свернуть вопрос')); expect(screen.getByText('Composer')).toBeVisible(); expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByLabelText('Развернуть вопрос')); expect(screen.getByRole('textbox')).toHaveValue('retained');
});


it('keeps the composer mounted below the question and the pet above it through collapse and completion', async () => {
  let posted = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { posted = true; return response({ state: 'submitted' }); }
    return response({ inputs: posted ? [] : [input], csrfToken: 'csrf' });
  });
  const { container } = render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()} mascot={<button>Pet</button>}><div data-testid="composer"><input aria-label="Message draft" defaultValue="Keep my draft" /><button>Queue action</button></div></ConnectedQuestionCard>);
  const composer = screen.getByTestId('composer');
  await screen.findByLabelText(/Alpha/);
  const stack = container.querySelector('.question-composer-stack')!;
  expect(stack).toHaveClass('has-question');
  expect(stack.children[0]).toHaveClass('question-pet-perch');
  expect(stack.children[1]).toHaveClass('question-frame');
  expect(stack.children[2]).toBe(composer);
  fireEvent.click(screen.getByRole('button', { name: /Свернуть вопрос/ }));
  expect(screen.getByTestId('composer')).toBe(composer);
  fireEvent.click(screen.getByRole('button', { name: /Развернуть вопрос/ }));
  expect(screen.getByRole('textbox', { name: 'Message draft' })).toHaveValue('Keep my draft');
  expect(screen.getByRole('button', { name: 'Queue action' })).toBeEnabled();
  fireEvent.click(screen.getByLabelText(/Alpha/));
  fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
  await waitFor(() => expect(stack).not.toHaveClass('has-question'));
  expect(screen.getByTestId('composer')).toBe(composer);
  expect(screen.getAllByRole('button', { name: 'Pet' })).toHaveLength(1);
});

it('collapsed strip is a single accessible expansion button without nested controls', () => {
 const expand=vi.fn(); render(<QuestionCard input={{...input,title:'Long '.repeat(80)}} minimized onMinimize={expand} onSubmit={vi.fn()}/>);
 const strip=screen.getByRole('button',{name:'Развернуть вопрос'}); expect(strip).toHaveAttribute('aria-expanded','false');
 expect(screen.queryByText('Подробнее')).toBeNull(); fireEvent.click(strip); expect(expand).toHaveBeenCalledOnce();
});
it('Enter submits selected choices and Other but never IME, repeats or modifiers', () => {
 const submit=card(); const option=screen.getByLabelText(/Alpha/);
 fireEvent.keyDown(option,{key:'Enter'}); expect(screen.getByRole('alert')).toHaveTextContent('Выберите');
 fireEvent.click(option);
 for(const extra of [{isComposing:true},{keyCode:229},{repeat:true},{shiftKey:true},{ctrlKey:true}])fireEvent.keyDown(option,{key:'Enter',...extra});
 expect(submit).not.toHaveBeenCalled(); fireEvent.keyDown(option,{key:'Enter'}); expect(submit).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByLabelText(/Другое/)); fireEvent.change(screen.getByRole('textbox'),{target:{value:'line'}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});expect(submit).toHaveBeenCalledTimes(2);
});
it('cancel is independent of answer validation and disabled while busy',()=>{
 const cancel=vi.fn();const view=render(<QuestionCard input={input} onSubmit={vi.fn()} onCancel={cancel}/>);
 fireEvent.click(screen.getByRole('button',{name:'Отменить вопрос'}));expect(cancel).toHaveBeenCalledOnce();
 view.rerender(<QuestionCard input={input} busy onSubmit={vi.fn()} onCancel={cancel}/>);expect(screen.getByRole('button',{name:'Отменить вопрос'})).toBeDisabled();
});
it('cancel shares the submission lock and advances to the next independent pending question', async()=>{
 let release!: (value:Response)=>void;
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>init?.method==='POST'?new Promise<Response>(resolve=>{release=resolve;}):response({inputs:[input,{...input,id:'q2',title:'Second?'}],csrfToken:'csrf'}));
 render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
 const cancel=await screen.findByRole('button',{name:'Отменить вопрос'});fireEvent.click(cancel);fireEvent.click(cancel);
 expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
 const post=fetcher.mock.calls.find(call=>call[1]?.method==='POST')!;expect(JSON.parse(post[1]!.body as string)).toEqual({id:'q',cancel:true});expect(post[1]!.headers).toMatchObject({'X-CSRF-Token':'csrf'});
 release(response({state:'cancelled'}));await screen.findByText('Second?');expect(screen.queryByText('Which?')).toBeNull();
});
it('counts two from outset, locks future, advances and reviews previous read-only', async () => {
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>response(init?.method==='POST'?{state:'submitted'}:{inputs:[{...input,id:'old',state:'submitted'},input,{...input,id:'q2',title:'Second?'}],csrfToken:'csrf'}));
 render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
 expect(await screen.findByText('1/2')).toBeVisible();
 expect(screen.getByRole('button',{name:'Вопрос 2 из 2'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText(/Alpha/));fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
 expect(await screen.findByText('2/2')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Вопрос 1 из 2'}));
 expect(screen.getByLabelText(/Alpha/)).toBeChecked();expect(screen.getByLabelText(/Alpha/)).toBeDisabled();expect(screen.getByRole('button',{name:'Отправить'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Вопрос 2 из 2'}));expect(screen.getByLabelText(/Alpha/)).not.toBeDisabled();
});
it('reconstructs overlapping episode after remount without unrelated archive',()=>{
 const row=(id:string,state:ChoiceInput['state'],createdAt:string,updatedAt:string):ChoiceInput=>({...input,id,state,createdAt,updatedAt});
 const rows=[row('old','submitted','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z'),row('first','submitted','2026-01-01T00:02:00Z','2026-01-01T00:04:00Z'),row('second','open','2026-01-01T00:03:00Z','2026-01-01T00:03:00Z')];
 expect(choiceEpisode(rows).map(item=>item.id)).toEqual(['first','second']);
 expect(choiceEpisode(rows.map(item=>({...item,state:'submitted'})))).toEqual([]);
});
it('Other Enter validates, Shift+Enter and IME stay local, repeated keys never submit',()=>{
 const submit=card();fireEvent.click(screen.getByLabelText(/Другое/));const text=screen.getByRole('textbox');
 fireEvent.keyDown(text,{key:'Enter'});expect(screen.getByRole('alert')).toHaveTextContent('Напишите');
 fireEvent.change(text,{target:{value:'answer'}});
 for(const extra of [{shiftKey:true},{isComposing:true},{keyCode:229},{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true}])fireEvent.keyDown(text,{key:'Enter',...extra});
 expect(submit).not.toHaveBeenCalled();fireEvent.keyDown(text,{key:'Enter'});expect(submit).toHaveBeenCalledExactlyOnceWith({otherSelected:true,other:'answer'});
});
it('batch keeps previous editable and sends only one atomic request with edited drafts', async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>response(init?.method==='POST'?{state:'submitted'}:{inputs:[input,{...input,id:'q2',title:'Second?'}],batch:{revision:'rev1',inputIds:['q','q2']},csrfToken:'csrf'}));
 const accepted=vi.fn();render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={accepted}><div>Composer</div></ConnectedQuestionCard>);
 expect(await screen.findByText('1/2')).toBeVisible();expect(screen.getByRole('button',{name:'Вопрос 2 из 2'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText(/Alpha/));fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
 expect(screen.getByText('2/2')).toBeVisible();expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Вопрос 1 из 2'}));expect(screen.getByLabelText(/Beta/)).not.toBeDisabled();fireEvent.click(screen.getByLabelText(/Beta/));
 fireEvent.click(screen.getByRole('button',{name:'Вопрос 2 из 2'}));fireEvent.click(screen.getByLabelText(/Alpha/));fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
 await waitFor(()=>expect(accepted).toHaveBeenCalledOnce());
 const calls=fetcher.mock.calls.filter(call=>call[1]?.method==='POST');expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1]!.body as string)).toEqual({revision:'rev1',answers:[{id:'q',value:'stable-b',otherSelected:false},{id:'q2',value:'stable-a',otherSelected:false}]});
});
it('batch failure preserves drafts and Enter duplicate is locked until response', async()=>{
 let release!:(value:Response)=>void;
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>init?.method==='POST'?new Promise<Response>(resolve=>{release=resolve;}):response({inputs:[{...input,agentId:'failure'}],batch:{revision:'rev',inputIds:['q']},csrfToken:'csrf'}));
 render(<ConnectedQuestionCard agentId="failure" readOnly={false} onAccepted={vi.fn()}><div>Composer</div></ConnectedQuestionCard>);
 fireEvent.click(await screen.findByLabelText(/Другое/));const text=screen.getByRole('textbox');fireEvent.change(text,{target:{value:'keep'}});fireEvent.keyDown(text,{key:'Enter'});fireEvent.keyDown(text,{key:'Enter'});
 expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
 release(new Response(JSON.stringify({error:'stale snapshot'}),{status:409,headers:{'Content-Type':'application/json'}}));
 await screen.findByRole('alert');expect(screen.getByRole('textbox')).toHaveValue('keep');expect(screen.getByRole('button',{name:'Отправить'})).not.toBeDisabled();
});
it('Other grows using scrollHeight and footer has return icon',()=>{
 card();fireEvent.click(screen.getByLabelText(/Другое/));const text=screen.getByRole('textbox');
 Object.defineProperty(text,'scrollHeight',{configurable:true,value:120});fireEvent.change(text,{target:{value:'one\ntwo\nthree'}});
 expect(text).toHaveStyle({height:'122px'});expect(text).toHaveAttribute('rows','1');expect(screen.getByRole('button',{name:'Отправить'})).toHaveTextContent('Enter');expect(screen.getByRole('button',{name:'Отправить'}).querySelector('svg')).not.toBeNull();
});
