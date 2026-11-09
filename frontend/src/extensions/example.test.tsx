import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { installedExtensions } from './installed';
import { createExtensionRegistry } from './registry';
import { sdkExample } from '../ui-plugins/sdk-example';

const exampleExtensions = createExtensionRegistry([sdkExample], {
  'sdk-example': { pages: ['overview'], panels: ['overview'], actions: ['top'] },
});
import { ExtensionSurface } from './ExtensionHost';

describe('public-SDK dev/test fixture', () => {
  it('does not register demonstration surfaces in production', () => {
    expect(installedExtensions).toEqual({ pages: [], navigation: [], panels: [], actions: [] });
    expect(exampleExtensions.pages).toHaveLength(1);
    expect(exampleExtensions.navigation).toHaveLength(1);
    expect(exampleExtensions.panels).toHaveLength(1);
    expect(exampleExtensions.actions).toHaveLength(1);
  });
  it('mounts through the registry, reads authenticated data, resyncs and closes its dialog', async () => {
    const unsubscribe = vi.fn();
    let resync: ((reason: string) => void) | undefined;
    window.hyperLive = { subscribe: options => { resync = options.resync; return unsubscribe; } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ agents: [{ id: 'one' }] }), { headers: { 'Content-Type': 'application/json' } }));
    fetcher.mockImplementation(async () => new Response(JSON.stringify({agents:[{id:'one'}]}),{headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch', fetcher);
    const result = render(<ExtensionSurface view={exampleExtensions.pages[0]} context={{agentId:'one',theme:'light',readOnly:false}} onClose={()=>{}} />);
    await waitFor(()=>expect(screen.getByText(/Доступные разговоры: 1/)).toBeTruthy());
    expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'same-origin',mode:'same-origin',redirect:'error'});
    fireEvent.change(screen.getByRole('textbox',{name:'Локальная заметка'}),{target:{value:'Example note'}});
    fireEvent.click(screen.getByRole('button',{name:'Показать заметку'}));
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByText('Example note')).toBeTruthy();
    resync?.('reconnected'); await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
    result.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
    delete window.hyperLive; vi.unstubAllGlobals();
  });
});
