import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatNavigation, navigationAnchor, navigationItems } from '../components/hyper/ChatNavigation';
import { fetchChatOutline, fetchThrough } from '../hooks/useChatOutline';
import type { ChatEvent } from '../lib/hyper';
const user = (idx: number): ChatEvent => ({ idx, ts: 0, type: 'user', text: `Prompt ${idx}`, messageIdx: idx });

describe('configured Claude turn navigation', () => {
  it('merges the complete outline with loaded durable inputs only', () => {
    expect(navigationItems([user(2), { ...user(3), messageIdx: null }], [{ idx: 1, prompt: 'Earlier' }, { idx: 2, prompt: 'Old' }])).toEqual([{ idx: 1, prompt: 'Earlier', loaded: false }, { idx: 2, prompt: 'Prompt 2', loaded: true }]);
  });
  it('excludes durable agent provenance and automation envelopes', () => {
    expect(navigationItems([{ ...user(1), navigationEligible: false }, { ...user(2), actor: 'agent:abc' }, { ...user(3), agentMessage: { from: 'abc', body: 'peer' } }, { ...user(4), text: '<team-update>work</team-update>' }, user(5)]).map(item => item.idx)).toEqual([5]);
  });
  it('is absent for a single known turn', () => {
    const { container } = render(<ChatNavigation events={[user(1)]} scrollRef={createRef()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('opens prompt-only rows on pointer entry and supports keyboard focus', () => {
    render(<ChatNavigation events={[user(1), user(2)]} scrollRef={createRef()} />);
    const nav = screen.getByRole('navigation'); fireEvent.pointerEnter(nav);
    expect(screen.getByRole('button', { name: 'Перейти к сообщению 1' })).toHaveTextContent('Prompt 1');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Перейти к сообщению 1' })).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole('button', { name: 'Показать навигацию по сообщениям' }));
    expect(screen.getByRole('button', { name: 'Перейти к сообщению 2' })).toBeVisible();
  });
  it('aligns loaded anchors 24px below viewport and honours reduced motion', async () => {
    const root = document.createElement('div'); const anchor = document.createElement('article'); anchor.dataset.eventIdx = '1'; root.append(anchor);
    root.scrollTo = vi.fn(); root.getBoundingClientRect = () => ({ top: 20 } as DOMRect); anchor.getBoundingClientRect = () => ({ top: 200 } as DOMRect);
    vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList);
    render(<ChatNavigation events={[user(1), user(2)]} scrollRef={{ current: root }} />);
    fireEvent.pointerEnter(screen.getByRole('navigation')); fireEvent.click(screen.getByRole('button', { name: 'Перейти к сообщению 1' }));
    await waitFor(() => expect(root.scrollTo).toHaveBeenCalledWith({ top: 156, behavior: 'instant' }));
    expect(anchor).toHaveAttribute('data-chat-nav-landed');
  });
  it('targets summary of collapsed details rather than hidden body', () => {
    const root = document.createElement('div'); root.innerHTML = '<details><summary>Work</summary><article data-event-idx="4"></article></details>';
    expect(navigationAnchor(root, 4)?.tagName).toBe('SUMMARY');
  });
  it('paginates outline with a strictly advancing cursor', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ items: [{ idx: 1, prompt: 'a' }], nextAfter: 1 })).mockResolvedValueOnce(Response.json({ items: [{ idx: 2, prompt: 'b' }], nextAfter: null }));
    expect(await fetchChatOutline('abc', new AbortController().signal)).toHaveLength(2);
    expect(fetcher.mock.calls[1][0]).toContain('after=1'); fetcher.mockRestore();
  });
  it('stops history pagination on non-progress and propagates errors', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ events: [user(9)], olderBefore: 10, hasOlder: true }));
    await expect(fetchThrough('abc', 1, 10, new AbortController().signal)).rejects.toThrow('Курсор');
    expect(fetcher).toHaveBeenCalledTimes(1); fetcher.mockRestore();
  });
  it('loads through selected event, stopping once found', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ events: [user(5)], olderBefore: 5, hasOlder: true })).mockResolvedValueOnce(Response.json({ events: [user(1)], olderBefore: 1, hasOlder: true }));
    expect((await fetchThrough('abc', 1, 10, new AbortController().signal)).map(event => event.idx)).toEqual([5, 1]);
    expect(fetcher).toHaveBeenCalledTimes(2); fetcher.mockRestore();
  });
});
