import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PageViewport } from '../components/layout/PageViewport';
import { ChatViewport } from '../components/layout/ChatViewport';
import { ExtensionSurface } from '../extensions/ExtensionHost';
it('keeps width controls outside the full-panel scroll container', () => {
  const { container } = render(<PageViewport active><div>Long page</div></PageViewport>);
  const viewport = container.querySelector('.page-viewport')!;
  const scroller = viewport.querySelector(':scope > .page-scroll-viewport')!;
  expect(scroller).not.toBeNull();
  expect(scroller.querySelector(':scope > .page-width-content')).toContainElement(screen.getByText('Long page'));
  expect(scroller.querySelector('[role="separator"]')).toBeNull();
  expect(viewport.querySelectorAll(':scope > [role="separator"]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Страница на всю ширину панели' }));
  expect(viewport.querySelector(':scope > .page-scroll-viewport')).toBe(scroller);
});
const key = 'mauzcode-ui.page-content-width-v1';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('shares the page preference across native and extension pages, independently from chat', () => {
  localStorage.setItem('mauzcode-ui.chat-content-width-v2', '704');
  const view = render(<PageViewport active><section className="plugins-page">Pages</section></PageViewport>);
  fireEvent.click(screen.getByRole('button', { name: 'Страница на всю ширину панели' }));
  expect(localStorage.getItem(key)).toBe('full');
  view.unmount();
  render(<PageViewport active><ExtensionSurface view={{ key: 'test/page', title: 'Test', component: () => <p>Plugin content</p> }} context={{ agentId: null, theme: 'light', readOnly: true }} onClose={() => {}} /></PageViewport>);
  expect(screen.getByRole('button', { name: 'Обычная ширина страницы' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Plugin content').closest('.page-width-content')).not.toBeNull();
  expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('704');
});
it('resizes with keyboard from either edge and resets on double click', () => {
  render(<PageViewport active>Page</PageViewport>);
  const right = screen.getByRole('separator', { name: /справа/ });
  fireEvent.keyDown(right, { key: 'Home' });
  fireEvent.keyDown(right, { key: 'ArrowRight' });
  expect(localStorage.getItem(key)).toBe('672');
  fireEvent.keyDown(screen.getByRole('separator', { name: /слева/ }), { key: 'ArrowLeft' });
  expect(localStorage.getItem(key)).toBe('704');
  fireEvent.keyDown(right, { key: 'End' });
  expect(localStorage.getItem(key)).toBe('full');
  fireEvent.doubleClick(right);
  expect(localStorage.getItem(key)).toBeNull();
});
it('resizes with pointer capture and releases the drag', () => {
  render(<PageViewport active>Page</PageViewport>);
  const right = screen.getByRole('separator', { name: /справа/ });
  right.setPointerCapture = vi.fn();
  right.hasPointerCapture = vi.fn(() => true);
  right.releasePointerCapture = vi.fn();
  fireEvent.keyDown(right, { key: 'Home' });
  fireEvent(right, new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
  fireEvent(right, new MouseEvent('pointermove', { bubbles: true, clientX: 120 }));
  expect(localStorage.getItem(key)).toBe('680');
  fireEvent.pointerUp(right, { pointerId: 1 });
  expect(right.releasePointerCapture).toHaveBeenCalled();
  expect(right).not.toHaveAttribute('data-dragging');
});
it('does not wrap chat or introduce a second set of controls', () => {
  const view = render(<PageViewport active={false}><ChatViewport>Chat</ChatViewport></PageViewport>);
  expect(view.container.querySelector('.page-viewport')).toBeNull();
  expect(screen.getAllByRole('separator')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Страница на всю ширину панели' })).toBeNull();
});
it('works when persistence is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<PageViewport active>Page</PageViewport>);
  fireEvent.click(screen.getByRole('button', { name: 'Страница на всю ширину панели' }));
  expect(screen.getByRole('button', { name: 'Обычная ширина страницы' })).toHaveAttribute('aria-pressed', 'true');
});
