import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LlmPolicySettings } from '../components/settings/LlmPolicySettings';
afterEach(() => { vi.unstubAllGlobals(); });
it('renders model, egress, tier and node controls and sends explicit CSRF protected mutations', async () => {
 const calls: RequestInit[] = [];
 vi.stubGlobal('fetch',vi.fn(async (_url: string, init: RequestInit = {}) => {
  if (init.method === 'POST') calls.push(init);
  return Response.json(init.method === 'POST' ? {ok:true} : {models:['codex:a'],disabledModels:[],instances:['box'],plans:{},tier:'standard',nodes:[{name:'relay',enabled:true,modelCount:3,catalogAt:null}],csrfToken:'csrf'});
 }));
 render(<LlmPolicySettings />);
 fireEvent.change(await screen.findByLabelText('MiniMax admission tier'),{target:{value:'priority'}});
 await waitFor(()=>expect(calls).toHaveLength(1));
 expect(JSON.parse(String(calls[0]!.body))).toEqual({action:'tier',tier:'priority'});
 expect(calls[0]!.headers).toMatchObject({'X-CSRF-Token':'csrf'});
 await waitFor(()=>expect(screen.getByLabelText('OpenCode instance')).not.toBeDisabled());
 fireEvent.change(screen.getByLabelText('OpenCode instance'),{target:{value:'box'}});
 await waitFor(()=>expect(calls).toHaveLength(2));
 expect(JSON.parse(String(calls[1]!.body))).toEqual({action:'instance',provider:'opencode',instance:'box'});
 await waitFor(()=>expect(screen.getByLabelText('codex:a')).not.toBeDisabled());
 fireEvent.click(screen.getByLabelText('codex:a'));
 await waitFor(()=>expect(calls).toHaveLength(3));
 expect(JSON.parse(String(calls[2]!.body))).toEqual({action:'model',model:'codex:a',disabled:true});
 expect(screen.getByText('relay')).toBeInTheDocument();
});
