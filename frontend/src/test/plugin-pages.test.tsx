import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginPages } from '../components/hyper/PluginPages';
import { getPlugins } from '../lib/plugins';

vi.mock('../lib/plugins', async importOriginal => ({ ...await importOriginal<typeof import('../lib/plugins')>(), getPlugins: vi.fn() }));
beforeEach(() => {
  vi.mocked(getPlugins).mockResolvedValue({ plugins: [], csrfToken: 'test' });
  document.querySelector('link[data-phosphor]')?.remove();
});

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

it('uses declared icons for every plugin page and defaults for missing or unsafe icons', async () => {
  vi.mocked(getPlugins).mockResolvedValue({ csrfToken: 'test', plugins: [
    { name: 'demo', icon: 'ph-book' }, { name: 'unsafe', icon: '<svg onload=alert(1)>' },
    { name: 'url', icon: 'https://example.com/icon.svg' },
  ] as Awaited<ReturnType<typeof getPlugins>>['plugins'] });
  const pages = ['demo/one', 'demo/two', 'missing/main', 'unsafe/main', 'url/main'].map(key => ({ key, title: key }));
  const { container } = render(<PluginPages loaded pages={pages} onOpen={() => {}} />);
  await waitFor(() => expect(container.querySelectorAll('.ph-book')).toHaveLength(2));
  expect(container.querySelectorAll('.plugins-tile svg')).toHaveLength(3);
  expect(container.querySelectorAll('.plugins-tile[aria-hidden="true"]')).toHaveLength(5);
  expect(container.querySelector('img, [onload]')).toBeNull();
  const stylesheet = document.querySelector('link[data-phosphor]')!;
  expect(stylesheet).toHaveAttribute('href', '/ui/vendor/phosphor.css');
  fireEvent.error(stylesheet);
  expect(container.querySelectorAll('.plugins-tile svg')).toHaveLength(5);
  expect(container.querySelector('.ph-book')).toBeNull();
});

it('keeps pages usable with default icons when metadata fails', async () => {
  vi.mocked(getPlugins).mockRejectedValue(new Error('Offline'));
  const open = vi.fn();
  const { container } = render(<PluginPages loaded pages={[{ key: 'demo/main', title: 'Demo' }]} onOpen={open} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Demo' }));
  expect(open).toHaveBeenCalledWith('demo/main');
  expect(container.querySelector('.plugins-tile svg')).not.toBeNull();
});
