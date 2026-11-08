import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/ui/Button';
import { Composer } from '../components/hyper/Composer';
import { SplitPane } from '../components/layout/SplitPane';
import { Sheet } from '../components/layout/Sheet';
import { App } from '../App';

describe('Reusable components', () => {
  it('does not activate a disabled button', async () => {
    const click = vi.fn(); render(<Button disabled onClick={click}>Создать</Button>);
    await userEvent.click(screen.getByRole('button')); expect(click).not.toHaveBeenCalled();
  });
  it('sends trimmed text and clears the composer', async () => {
    const send = vi.fn(); render(<Composer onSend={send} />);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), '  Привет  ');
    await userEvent.click(screen.getByRole('button'));
    expect(send).toHaveBeenCalledWith('Привет'); expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('does not send on Shift+Enter', () => {
    const send = vi.fn(); render(<Composer onSend={send} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Текст' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('resizes with keyboard and respects bounds', () => {
    const resize = vi.fn(); render(<SplitPane primary="Canvas" secondary="Чат" secondaryWidth={320} onWidthChange={resize} />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' }); expect(resize).toHaveBeenLastCalledWith(320);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' }); expect(resize).toHaveBeenLastCalledWith(336);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' }); expect(resize).toHaveBeenLastCalledWith(640);
  });
  it('exposes a named dialog and requests closing', async () => {
    const close = vi.fn(); render(<Sheet title="Агенты" open onOpenChange={close}><button>Выбрать</button></Sheet>);
    expect(await screen.findByRole('dialog', { name: 'Агенты' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть навигацию' })); expect(close).toHaveBeenCalledWith(false);
  });
  it('switches theme, toggles Canvas, and isolates local messages by agent', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Тёмная тема' })); expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть Canvas' })); expect(screen.queryByRole('region', { name: 'Canvas' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'Тестовое сообщение'); await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(screen.getByText('Тестовое сообщение')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Исследование Референсы/ })); expect(screen.queryByText('Тестовое сообщение')).not.toBeInTheDocument();
  });
});
