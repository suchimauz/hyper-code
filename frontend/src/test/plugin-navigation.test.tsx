import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createExtensionRegistry } from '../extensions/registry';
import type { UiExtension } from '@hyper/ui';
import { WorkspaceSidebar } from '../components/hyper/WorkspaceSidebar';

const extension: UiExtension = { id: 'example', apiVersion: 1, pages: [{ id: 'main', title: 'Example', component: () => null }], navigation: [{ page: 'main', title: 'Example' }] };
it('legacy navigation stays a page-menu entry without opting into direct navigation', () => {
  const registry = createExtensionRegistry([extension], { example: { pages: ['main'] } });
  expect(registry.navigation).toEqual([{ key: 'example/main', title: 'Example' }]);
  expect(registry.sidebarNavigation).toEqual([]);
  expect(createExtensionRegistry([extension], {}).navigation).toEqual([]);
});
it('direct links require both page and explicit placement grants', () => {
  const direct = { ...extension, sidebarNavigation: extension.navigation };
  expect(createExtensionRegistry([direct], { example: { pages: ['main'] } }).sidebarNavigation).toEqual([]);
  expect(createExtensionRegistry([direct], { example: { sidebarNavigation: ['main'] } }).sidebarNavigation).toEqual([]);
  expect(createExtensionRegistry([direct], { example: { pages: ['main'], sidebarNavigation: ['main'] } }).sidebarNavigation).toHaveLength(1);
  expect(() => createExtensionRegistry([{ ...extension, sidebarNavigation: [{ page: 'missing', title: 'Bad' }] }], {})).toThrow('Invalid navigation');
});
it.each([false, true])('opens a dedicated Pages screen without a dropdown (compact=%s)', async compact => {
  const select = vi.fn();
  render(<WorkspaceSidebar projects={[]} user={null} selected="" theme="light" onTheme={() => {}} onToggle={() => {}} onSelect={() => {}} onRetry={() => {}} compact={compact}
    onOpenPages={select} pagesActive
    extensionNavigation={[{ key: 'direct', title: 'Direct', active: false, onSelect: () => {} }]} />);
  expect(screen.queryByRole('button', { name: 'Direct' })).toBeNull();
  expect(screen.getByRole('button', { name: 'More' })).toBeVisible();
  const button = screen.getByRole('button', { name: 'Pages' });
  expect(button).toHaveAttribute('aria-current', 'page');
  expect(button).not.toHaveAttribute('aria-haspopup');
  await userEvent.setup().click(button);
  expect(select).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('pins New Session, Plugins, Pages and Cron Tasks; hides plugin pages under More', async () => {
  const direct = vi.fn(), plugins = vi.fn();
  render(<WorkspaceSidebar projects={[]} user={null} selected="" theme="light" onTheme={() => {}} onToggle={() => {}} onSelect={() => {}} onRetry={() => {}}
    onNewSession={() => {}} onOpenPages={() => {}} onOpenAutomation={() => {}} onOpenPlugins={plugins}
    extensionNavigation={[{ key: 'direct', title: 'Direct', active: false, onSelect: direct }]} />);
  const names = Array.from(document.querySelectorAll('.workspace-actions > .workspace-action')).map(el => el.getAttribute('aria-label'));
  expect(names).toEqual(['New Session', 'Plugins', 'Pages', 'Cron Tasks', 'More']);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Direct' }));
  expect(direct).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Plugins' }));
  expect(plugins).toHaveBeenCalledOnce();
});

it('on phones pins only New Session and moves Plugins, Pages and Cron Tasks under More', async () => {
  const pages = vi.fn();
  render(<WorkspaceSidebar projects={[]} user={null} selected="" theme="light" onTheme={() => {}} onToggle={() => {}} onSelect={() => {}} onRetry={() => {}} mobile
    onNewSession={() => {}} onOpenPages={pages} onOpenAutomation={() => {}} onOpenPlugins={() => {}}
    extensionNavigation={[{ key: 'direct', title: 'Direct', active: false, onSelect: () => {} }]} />);
  const names = Array.from(document.querySelectorAll('.workspace-actions > .workspace-action')).map(el => el.getAttribute('aria-label'));
  expect(names).toEqual(['New Session', 'More']);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'More' }));
  expect((await screen.findAllByRole('menuitem')).map(el => el.textContent)).toEqual(['Plugins', 'Pages', 'Cron Tasks', 'Direct']);
  await user.click(screen.getByRole('menuitem', { name: 'Pages' }));
  expect(pages).toHaveBeenCalledOnce();
});
