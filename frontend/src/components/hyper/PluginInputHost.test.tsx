import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PluginInputHost } from './PluginInputHost';
import { FixtureInputCard } from '../../test/fixtures/input-card';
import { requestJson } from '../../lib/hyper';
const refresh = vi.hoisted(() => vi.fn());
const dispose = vi.hoisted(() => vi.fn());
vi.mock('../../lib/hyper', () => ({ requestJson: vi.fn(async () => ({inputs:[{id:'one',kind:'fixture-review',title:'Review',state:'open'}]})) }));
vi.mock('../../extensions/pluginRuntime', () => ({ usePluginUi: () => ({ registry: { inputKinds:[{key:'fixture/fixture-review',kind:'fixture-review',component:FixtureInputCard}] } }) }));
vi.mock('../../lib/liveRefresh', () => ({liveRefresh: (opts: {read:(signal:AbortSignal)=>Promise<void>}) => { void opts.read(new AbortController().signal); return {refresh,dispose}; }}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
test('approved native input card receives safe metadata and refresh cannot complete it', async () => {
 const {unmount} = render(<PluginInputHost agentId="owner" />);
 expect(await screen.findByText('Pending')).toBeTruthy();
 expect(requestJson).toHaveBeenCalledWith('/input/cards?agentId=owner',expect.anything());
 fireEvent.click(screen.getByRole('button',{name:'Refresh receipt'}));
 expect(refresh).toHaveBeenCalledTimes(1);
 expect(requestJson).toHaveBeenCalledTimes(1);
 unmount(); expect(dispose).toHaveBeenCalledTimes(1);
});
test.each(['processing','submitted','cancelled','expired','pending',undefined])('%s input props fail closed as read-only receipts',async(state)=>{
 vi.mocked(requestJson).mockResolvedValueOnce({inputs:[{id:'one',kind:'fixture-review',title:'Review',state}]});
 render(<PluginInputHost agentId="owner" />);
 expect(await screen.findByText('Receipt')).toBeTruthy();
});
