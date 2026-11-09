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
  expect(screen.getByRole('button', { name: 'Direct' })).toBeVisible();
  const button = screen.getByRole('button', { name: 'Pages' });
  expect(button).toHaveAttribute('aria-current', 'page');
  expect(button).not.toHaveAttribute('aria-haspopup');
  await userEvent.setup().click(button);
  expect(select).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
