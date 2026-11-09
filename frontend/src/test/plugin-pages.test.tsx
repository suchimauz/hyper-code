import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginPages } from '../components/hyper/PluginPages';

it('lists granted page entries in the Plugins layout and opens a selected page', async () => {
  const open = vi.fn();
  const { container } = render(<PluginPages loaded pages={[{ key: 'demo/main', title: 'Demo page' }]} onOpen={open} />);
  expect(screen.getByRole('heading', { name: 'Pages' })).toBeVisible();
  expect(container.querySelector('.plugins-search + .plugins-section .plugins-list .plugins-card')).not.toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Demo page' }));
  expect(open).toHaveBeenCalledWith('demo/main');
});
it('distinguishes loading from no accessible plugin pages', () => {
  const { rerender } = render(<PluginPages loaded={false} pages={[]} onOpen={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Загрузка');
  rerender(<PluginPages loaded pages={[]} onOpen={() => {}} />);
  expect(screen.getByRole('status').parentElement).toHaveClass('plugins-section');
  expect(screen.getByRole('status')).toHaveTextContent('Нет доступных');
});
it('filters by title and plugin ID, reports no matches and clears with keyboard focus', async () => {
  const pages = [{ key: 'demo/main', title: 'Обзор' }, { key: 'reports/main', title: 'Reports' }];
  const open = vi.fn();
  const { container } = render(<PluginPages loaded pages={pages} onOpen={open} />);
  const user = userEvent.setup();
  const input = screen.getByRole('searchbox', { name: 'Поиск страниц' });
  expect(container.querySelector('.plugins-search input')).toBe(input);
  await user.type(input, '  ОБЗОР  ');
  expect(screen.getByRole('button', { name: 'Обзор' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Reports' })).toBeNull();
  await user.clear(input);
  await user.type(input, 'DEMO');
  await user.click(screen.getByRole('button', { name: 'Обзор' }));
  expect(open).toHaveBeenCalledWith('demo/main');
  await user.clear(input);
  await user.type(input, 'missing');
  expect(screen.getByRole('status')).toHaveTextContent('Страницы не найдены');
  await user.tab();
  expect(screen.getByRole('button', { name: 'Очистить поиск' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(input).toHaveFocus();
  expect(input).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Reports' })).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});
