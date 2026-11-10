import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerFooter } from '../components/mauzcode/ComposerFooter';
const props = { agentId:'fixture', busy:false, running:false, revision:0, onMenuToggle:vi.fn(), menuOpen:false };
const result = (input: number | null, output: number | null, ratio: number | null) => ({ budget:{estimatedTokens:8000,contextWindow:200000}, details:{breakdown:null,session:{},usage:{inputTokens:input,outputTokens:output,cacheHitRatio:ratio,cachedInputTokens:3000000,cacheWriteTokens:100000,requests:5}} });
afterEach(() => vi.unstubAllGlobals());
it('shows separate exact input and output without double-counting cache and opens the context meter dialog', async () => {
 vi.stubGlobal('fetch', vi.fn(async()=>Response.json(result(3400000,100000,.94))));
 render(<ComposerFooter {...props}/>);
 expect(await screen.findByText('3,400,000 tok')).toBeInTheDocument(); expect(screen.getByText('100,000 tok')).toBeInTheDocument(); expect(screen.queryByText('3.5Mtok')).not.toBeInTheDocument(); expect(screen.getByText('↑')).toBeInTheDocument(); expect(screen.getByText('↓')).toBeInTheDocument(); expect(screen.getByText('94%')).toBeInTheDocument();
 const usage=screen.getByRole('button',{name:/Input: 3,400,000 tok. Output: 100,000 tok/});
 await userEvent.click(usage);
 const dialog=await screen.findByRole('dialog',{name:'Context usage'});
 expect(dialog).toHaveTextContent('Token usage'); expect(usage).toHaveAttribute('aria-controls',dialog.id);
 expect(screen.getByRole('button',{name:/4% of context used/})).toHaveAttribute('aria-expanded','true');
 await userEvent.keyboard('{Escape}');
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('keeps missing usage distinct from measured zero', async () => {
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(result(null,null,null))));
 const ui=render(<ComposerFooter {...props}/>);
 await screen.findByText('4%'); expect(screen.getAllByText('— tok')).toHaveLength(2); expect(screen.getByText('кэш —')).toBeInTheDocument();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(result(0,0,0))));
 ui.rerender(<ComposerFooter {...props} revision={1}/>);
 expect(await screen.findAllByText('0 tok')).toHaveLength(2); expect(screen.getByText('0%')).toBeInTheDocument();
});
