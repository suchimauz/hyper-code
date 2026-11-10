import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuestionHistoryContext, QuestionHistoryList, choiceResultId } from '../components/hyper/QuestionHistory';
import type { ChatEvent } from '../lib/hyper';
import type { HistoryInput } from '../lib/history';
afterEach(cleanup);
const request = (id: string, kind: string): ChatEvent => ({ idx: 1, ts: 1, type: 'input', kind, inputId: id, text: null });
const show = (input: HistoryInput) => render(<QuestionHistoryContext.Provider value={[input]}><QuestionHistoryList events={[request(input.id, input.kind)]} agentId="a" /></QuestionHistoryContext.Provider>);
describe('confirm and grid history', () => {
  it('accepts confirm and grid ids but not secret', () => {
    expect(choiceResultId(request('c1', 'confirm'))).toBe('c1');
    expect(choiceResultId(request('g1', 'grid'))).toBe('g1');
    expect(choiceResultId(request('s1', 'secret'))).toBeNull();
  });
  it('shows confirm decision and comment', () => {
    show({ id: 'c1', agentId: 'a', kind: 'confirm', title: 'Push?', state: 'submitted', spec: { details: 'main', confirmLabel: 'Пушим', declineLabel: 'Нет', danger: false }, result: { confirmed: true, comment: 'ок' } });
    expect(screen.getByText('Подтверждение · 1')).toBeTruthy();
    expect(screen.getAllByText('Пушим — ок').length).toBeGreaterThan(0);
  });
  it('shows picked grid rows as a table', () => {
    show({ id: 'g1', agentId: 'a', kind: 'grid', title: 'Pick', state: 'submitted', spec: { columns: [{ label: 'Язык' }, { label: 'Год' }], multiple: true }, result: { rows: [['Go', '2009'], ['Rust', '2015']] } });
    expect(screen.getByText('Таблица · 1')).toBeTruthy();
    expect(screen.getAllByText('Выбрано 2: Go, Rust').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('columnheader', { name: 'Год' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Rust' })).toBeTruthy();
  });
  it('shows cancelled grid status', () => {
    show({ id: 'g2', agentId: 'a', kind: 'grid', title: 'Pick', state: 'cancelled', spec: { columns: [{ label: 'Язык' }], multiple: false }, result: null });
    expect(screen.getAllByText('Вопрос отменён').length).toBeGreaterThan(0);
  });
});
