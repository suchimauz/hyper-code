import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createExtensionRegistry } from './registry';
import { ExtensionActionButton, ExtensionSurface } from './ExtensionHost';
import type { UiExtension } from './types';
const view = () => <p>Plugin content</p>;
const plugin: UiExtension = { id: 'example', apiVersion: 1, pages: [{ id: 'main', title: 'Main', component: view }], navigation: [{ page: 'main', title: 'Open main' }], panels: [{ id: 'panel', title: 'Panel', component: view }], actions: [{ id: 'act', title: 'Act', run: () => {} }] };
const context = { agentId: 'test', theme: 'dark' as const, readOnly: false };
describe('host extension registry', () => {
  it('defaults to no granted surfaces', () => expect(createExtensionRegistry([plugin], {})).toEqual({pages:[],navigation:[],panels:[],actions:[]}));
  it('grants each surface independently, with namespaced keys and immutable snapshots', () => {
    const registry = createExtensionRegistry([plugin], { example: { pages: ['main'], panels: ['panel'] } });
    expect(registry.pages[0].key).toBe('example/main'); expect(registry.navigation[0].key).toBe('example/main');
    expect(registry.panels).toHaveLength(1); expect(registry.actions).toHaveLength(0); expect(Object.isFrozen(registry.pages)).toBe(true);
  });
  it('rejects duplicate plugins, entries, unsupported versions, broken navigation', () => {
    expect(() => createExtensionRegistry([plugin, plugin], {})).toThrow();
    expect(() => createExtensionRegistry([{ ...plugin, pages: [...plugin.pages!, ...plugin.pages!] }], {})).toThrow();
    expect(() => createExtensionRegistry([{ ...plugin, apiVersion: 2 as 1 }], {})).toThrow();
    expect(() => createExtensionRegistry([{ ...plugin, navigation: [{page:'missing',title:'Missing'}] }], {})).toThrow();
  });
  it('never grants via inherited properties', () => {
    expect(createExtensionRegistry([plugin], Object.create({ example: { pages: ['main'] } })).pages).toHaveLength(0);
  });
  it('renders a host-labelled surface and close control', () => {
    const close = vi.fn(); render(<ExtensionSurface view={{key:'example/main',title:'Example',component:view}} context={context} onClose={close} />);
    expect(screen.getByText('Plugin content')).toBeTruthy(); fireEvent.click(screen.getByRole('button',{name:'Закрыть Example'})); expect(close).toHaveBeenCalledOnce();
  });
  it('prevents mutating actions in read-only chats', () => {
    const run = vi.fn(); render(<ExtensionActionButton action={{key:'x/y',id:'y',title:'Write',run,mutates:true}} context={{...context,readOnly:true}} />);
    fireEvent.click(screen.getByRole('button',{name:'Write'})); expect(run).not.toHaveBeenCalled();
  });
  it('reports action failures and restores availability', async () => {
    render(<ExtensionActionButton action={{key:'x/z',id:'z',title:'Fail',run:async()=>{throw new Error('Failed safely');}}} context={context} />);
    fireEvent.click(screen.getByRole('button',{name:'Fail'})); await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Failed safely'));
    expect(screen.getByRole('button',{name:'Fail'}).hasAttribute('disabled')).toBe(false);
  });
});
