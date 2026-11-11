import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BatchCard, BatchFields } from '../components/mauzcode/BatchCard';
import { getBatch, writeBatch, type BatchSnapshot } from '../lib/batches';
import { createExtensionRegistry } from '../extensions/registry';
import { QuestionHistoryContext, QuestionHistoryList, choiceResultId } from '../components/mauzcode/QuestionHistory';
const mocks = vi.hoisted(() => ({ kinds: [] as { kind: string; component: () => null; batchComponent?: () => null }[] }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => ({ registry: { inputKinds: mocks.kinds } }) }));
vi.mock('../lib/batches', async importOriginal => ({ ...await importOriginal<typeof import('../lib/batches')>(), getBatch: vi.fn(), writeBatch: vi.fn() }));
const initial = (): BatchSnapshot => ({ id: 'b1', agentId: 'a', kind: 'batch', title: 'Вопросы', state: 'open', revision: 0, currentStep: 0, items: [{ key: 'first', kind: 'choice', title: 'Цвет', spec: { options: ['Blue', 'Red'] }, filled: false, contractVersion: 1 }, { key: 'second', kind: 'confirm', title: 'Продолжить?', spec: {}, filled: false, contractVersion: 1 }] });
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.kinds = []; });
describe('atomic collection card', () => {
  it.each(['poll', 'conflict', 'manual'] as const)('discards stale per-step edits after %s refresh instead of overwriting another tab', async mode => {
    let state = initial();
    state.items = state.items.map(item => ({ ...item, filled: true, draft: (item.kind === 'choice' ? { pick: ['Blue'] } : { decision: 'yes' }) as Record<string, string | string[]> }));
    const write = async (_id: string, action: string, body: Record<string, unknown>) => {
      state = { ...state, revision: state.revision + 1, currentStep: typeof body.currentStep === 'number' ? body.currentStep : state.currentStep, state: action === 'submit' ? 'submitted' : state.state }; return state;
    };
    vi.mocked(writeBatch).mockImplementation(write);
    const view = render(<BatchCard initial={state} onSnapshot={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Вопрос 2 из 2' }));
    await screen.findByRole('heading', { name: 'Продолжить?' });
    state = { ...state, revision: 10 }; // Tab B saved Blue; A still has a cached Red edit.
    vi.mocked(getBatch).mockResolvedValue(state);
    if (mode === 'poll') view.rerender(<BatchCard initial={state} onSnapshot={() => {}} />);
    else {
      vi.mocked(writeBatch).mockRejectedValueOnce(new Error('revision conflict'));
      if (mode === 'manual') vi.mocked(getBatch).mockRejectedValueOnce(new Error('offline'));
      fireEvent.click(screen.getByText('Отправить все ответы'));
      await waitFor(() => expect(getBatch).toHaveBeenCalledTimes(1));
      if (mode === 'manual') fireEvent.click(await screen.findByText('Обновить состояние'));
    }
    await screen.findByText(/Несохранённые правки сброшены/);
    vi.mocked(writeBatch).mockClear();
    fireEvent.click(screen.getByText('Отправить все ответы'));
    await waitFor(() => expect(vi.mocked(writeBatch).mock.calls.at(-1)?.[1]).toBe('submit'));
    expect(vi.mocked(writeBatch).mock.calls.some(call => call[2].key === 'first' && call[2].values)).toBe(false);
    expect(state.items[0].draft).toEqual({ pick: ['Blue'] });
  });
  it('saves draft, restores an edited previous step, and submits only on final explicit action', async () => {
    let state = initial();
    vi.mocked(writeBatch).mockImplementation(async (_id, action, body) => {
      state = { ...state, revision: state.revision + 1, items: state.items.map(item => item.key === body.key && body.values ? { ...item, draft: body.values as Record<string, string>, filled: true } : item), currentStep: typeof body.currentStep === 'number' ? body.currentStep : state.currentStep, state: action === 'submit' ? 'submitted' : state.state }; return state;
    });
    render(<BatchCard initial={state} onSnapshot={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Blue' })); fireEvent.click(screen.getByText('Далее'));
    await screen.findByText('Продолжить?');
    expect(writeBatch).toHaveBeenCalledTimes(1); expect(vi.mocked(writeBatch).mock.calls[0][1]).toBe('draft');
    fireEvent.click(screen.getByText('Назад')); await screen.findByText('Цвет');
    expect(vi.mocked(writeBatch).mock.calls[1][2]).not.toHaveProperty('values');
    expect((screen.getByRole('radio', { name: 'Blue' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Red' })); fireEvent.click(screen.getByText('Далее')); await screen.findByText('Продолжить?');
    fireEvent.click(screen.getByRole('button', { name: 'Нет' })); fireEvent.click(screen.getByText('Отправить все ответы'));
    await waitFor(() => expect(writeBatch).toHaveBeenCalledTimes(5));
    expect(vi.mocked(writeBatch).mock.calls[3][2].values).toEqual({ decision: 'no' });
    expect(vi.mocked(writeBatch).mock.calls[4][1]).toBe('submit');
    expect(state.items[0].draft).toEqual({ pick: ['Red'] });
  });
  it('does not retry failed writes and preserves invalid local edits after same-revision read', async () => {
    const state = initial(); vi.mocked(writeBatch).mockRejectedValue(new Error('private raw data')); vi.mocked(getBatch).mockResolvedValue(state);
    render(<BatchCard initial={state} onSnapshot={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Red' })); fireEvent.click(screen.getByText('Далее'));
    await waitFor(() => expect(getBatch).toHaveBeenCalledTimes(1));
    expect(writeBatch).toHaveBeenCalledTimes(1); expect((screen.getByRole('radio', { name: 'Red' }) as HTMLInputElement).checked).toBe(true); expect(screen.queryByText('private raw data')).toBeNull();
  });
  it('never falls back to the ordinary plugin component', () => {
    const ordinary = vi.fn(() => null); mocks.kinds = [{ kind: 'demo.note', component: ordinary }]; const state = initial(); state.items[0].kind = 'demo.note';
    render(<BatchCard initial={state} onSnapshot={() => {}} />);
    expect(ordinary).not.toHaveBeenCalled(); expect((screen.getByText('Далее') as HTMLButtonElement).disabled).toBe(true); expect((screen.getByText('Отменить всё') as HTMLButtonElement).disabled).toBe(false);
  });
  it('can go back from an empty secret without reading or saving its field', async () => {
    const state = initial(); state.currentStep = 1; state.items[1].kind = 'secret'; vi.mocked(writeBatch).mockResolvedValue({ ...state, currentStep: 0, revision: 1 });
    render(<BatchCard initial={state} onSnapshot={() => {}} />); fireEvent.click(screen.getByText('Назад'));
    await waitFor(() => expect(writeBatch).toHaveBeenCalledWith('b1', 'draft', { revision: 0, key: 'second', currentStep: 0 }, undefined)); expect(document.querySelector('input[type=password]')).toBeNull();
  });
  it('binds secret acknowledgements to frame, origin and step and keeps values outside React', async () => {
    const state = initial(); state.items[0].kind = 'secret';
    vi.mocked(getBatch).mockResolvedValue({ ...state, revision: 1 }); vi.mocked(writeBatch).mockResolvedValue({ ...state, revision: 2, currentStep: 1 });
    render(<BatchCard initial={state} onSnapshot={() => {}} />);
    const frame = screen.getByTitle('Цвет') as HTMLIFrameElement;
    const ack = (source: MessageEventSource | null, origin: string, data: object) => fireEvent(window, new MessageEvent('message', { source, origin, data: { source: 'mauzcode-batch-secret', id: 'b1', key: 'first', ...data } }));
    ack(window, location.origin, { state: 'ready' }); expect((screen.getByText('Далее') as HTMLButtonElement).disabled).toBe(true);
    ack(frame.contentWindow, 'https://wrong.invalid', { state: 'ready' }); expect((screen.getByText('Далее') as HTMLButtonElement).disabled).toBe(true);
    ack(frame.contentWindow, location.origin, { state: 'ready' });
    fireEvent.click(screen.getByText('Далее')); expect(writeBatch).not.toHaveBeenCalled();
    ack(frame.contentWindow, location.origin, { state: 'saved', filled: true, revision: 1 });
    await waitFor(() => expect(writeBatch).toHaveBeenCalledWith('b1', 'draft', { revision: 1, key: 'first', currentStep: 1 }, undefined));
  });
  it('matches native keyboard handling and preserves focus while ignoring IME Enter', async () => {
    const state = initial(); vi.mocked(writeBatch).mockResolvedValue({ ...state, revision: 1, currentStep: 1 });
    render(<BatchCard initial={state} onSnapshot={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Цвет' })).toBe(document.activeElement);
    const radio = screen.getByRole('radio', { name: 'Blue' }); fireEvent.click(radio);
    fireEvent.keyDown(radio, { key: 'Enter', isComposing: true }); fireEvent.keyDown(radio, { key: 'Enter', shiftKey: true }); expect(writeBatch).not.toHaveBeenCalled();
    fireEvent.keyDown(radio, { key: 'Enter' }); fireEvent.keyDown(radio, { key: 'Enter' });
    await screen.findByRole('heading', { name: 'Продолжить?' }); expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Продолжить?' })).toBe(document.activeElement);
    expect(document.querySelector('.question-frame .question-header .question-navigation')).toBeTruthy();
  });
  it('retains edited drafts across numbered navigation and flushes them before final submit', async () => {
    let state = initial(); state.items = state.items.map(item => ({ ...item, filled: true, draft: (item.kind === 'choice' ? { pick: ['Blue'] } : { decision: 'yes' }) as Record<string, string | string[]> }));
    vi.mocked(writeBatch).mockImplementation(async (_id, action, body) => {
      state = { ...state, revision: state.revision + 1, currentStep: typeof body.currentStep === 'number' ? body.currentStep : state.currentStep, state: action === 'submit' ? 'submitted' : state.state }; return state;
    });
    render(<BatchCard initial={state} onSnapshot={() => {}} />); fireEvent.click(screen.getByRole('radio', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Вопрос 2 из 2' })); await screen.findByRole('heading', { name: 'Продолжить?' });
    fireEvent.click(screen.getByRole('button', { name: 'Вопрос 1 из 2' })); await screen.findByRole('heading', { name: 'Цвет' }); expect((screen.getByRole('radio', { name: 'Red' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Вопрос 2 из 2' })); await screen.findByRole('heading', { name: 'Продолжить?' }); fireEvent.click(screen.getByText('Отправить все ответы'));
    await waitFor(() => expect(vi.mocked(writeBatch).mock.calls.at(-1)?.[1]).toBe('submit'));
    expect(vi.mocked(writeBatch).mock.calls.some(call => call[1] === 'draft' && call[2].key === 'first' && JSON.stringify(call[2].values) === JSON.stringify({ pick: ['Red'] }))).toBe(true);
  });
  it('cancels without sending an unsaved answer or secret field value', async () => {
    const state = initial(); vi.mocked(writeBatch).mockResolvedValue({ ...state, state: 'cancelled' });
    render(<BatchCard initial={state} onSnapshot={() => {}} />); fireEvent.click(screen.getByRole('radio', { name: 'Red' })); fireEvent.click(screen.getByText('Отменить всё'));
    await waitFor(() => expect(writeBatch).toHaveBeenCalledWith('b1', 'cancel', { revision: 0 }, undefined)); expect(writeBatch).toHaveBeenCalledTimes(1);
  });
  it('keeps dirty answers through same-revision polling and locks processing receipts', () => {
    const state = initial(); const view = render(<BatchCard initial={state} onSnapshot={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Red' })); view.rerender(<BatchCard initial={{ ...state }} onSnapshot={() => {}} />);
    expect((screen.getByRole('radio', { name: 'Red' }) as HTMLInputElement).checked).toBe(true);
    view.rerender(<BatchCard initial={{ ...state, state: 'processing', revision: 1 }} onSnapshot={() => {}} />);
    expect((screen.getByText('Далее') as HTMLButtonElement).disabled).toBe(true); expect((screen.getByText('Отменить всё') as HTMLButtonElement).disabled).toBe(true); expect(writeBatch).not.toHaveBeenCalled();
  });
  it('reserves batch and rejects non-component controlled editors', () => {
    expect(() => createExtensionRegistry([{ id: 'demo', apiVersion: 1, inputKinds: [{ kind: 'batch', component: () => null }] }], { demo: { inputKinds: ['batch'] } })).toThrow();
    expect(() => createExtensionRegistry([{ id: 'demo', apiVersion: 1, inputKinds: [{ kind: 'demo.note', component: () => null, batchComponent: 'bad' as never }] }], { demo: { inputKinds: ['demo.note'] } })).toThrow();
  });
  it('collects confirm=false without interpreting it as cancel', () => {
    const change = vi.fn(); render(<BatchFields item={initial().items[1]} draft={{}} onChange={change} busy={false} />); fireEvent.click(screen.getByRole('button', { name: 'Нет' })); expect(change).toHaveBeenCalledWith({ decision: 'no' });
  });
  it('reuses native bodies and pressed decision buttons inside a step', () => {
    const change = vi.fn(); render(<BatchFields item={{ ...initial().items[1], spec: { confirmLabel: 'Да', declineLabel: 'Нет', details: '**exact**' } }} draft={{ decision: 'yes' }} onChange={change} busy={false} />);
    expect(screen.getByRole('button', { name: 'Да' })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByRole('button', { name: 'Нет' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('exact').tagName).toBe('STRONG');
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'ok' } }); expect(change).toHaveBeenLastCalledWith({ decision: 'yes', comment: 'ok' });
  });
  it('filters inline grid rows and records picks as values', () => {
    const change = vi.fn(); const item = { key: 'g', kind: 'grid', title: 'Строка', spec: { rows: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }], columns: [{ key: 'name', label: 'Имя' }], valueKey: 'id', multiple: true }, filled: false, contractVersion: 1 as const };
    render(<BatchFields item={item} draft={{ pick: ['1'] }} onChange={change} busy={false} />);
    fireEvent.change(screen.getByLabelText('Фильтр строк'), { target: { value: 'bet' } });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked(); fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(change).toHaveBeenLastCalledWith({ pick: ['1', '2'] });
  });
  it('renders one expandable history receipt with safe summaries only', () => {
    const state = initial(); state.state = 'submitted'; state.history = { summary: 'Все ответы отправлены', items: [{ key: 'first', kind: 'secret', title: 'Ключ', summary: 'secret://demo/key' }, { key: 'second', kind: 'confirm', title: 'Продолжить?', summary: 'Нет' }] };
    const event = { idx: 1, ts: 1, type: 'input', kind: 'batch', inputId: 'b1', text: null };
    expect(choiceResultId(event)).toBe('b1'); render(<QuestionHistoryContext.Provider value={[state]}><QuestionHistoryList events={[event]} agentId="a" /></QuestionHistoryContext.Provider>);
    fireEvent.click(screen.getByText('Вопросы · 2')); expect(screen.getByText('secret://demo/key')).toBeTruthy(); expect(document.querySelectorAll('.question-history')).toHaveLength(1);
  });
});
