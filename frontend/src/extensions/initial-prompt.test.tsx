import { it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InitialPromptPage } from '../ui-plugins/initial-prompt';
const request = vi.hoisted(() => vi.fn());
vi.mock('@hyper/ui', () => ({ requestJson: request, Panel: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h1>{title}</h1>{children}</section> }));
afterEach(() => { cleanup(); request.mockReset(); window.history.replaceState({}, '', '/'); });
it('reads literal full prompt without interpreting HTML or Markdown', async () => {
  window.history.replaceState({}, '', '/?promptAgent=aa');
  const prompt = '# Exact\n<script>alert(1)</script>\n${literal}\n';
  request.mockResolvedValue({ agentId: 'aa', title: 'Agent', prompt, characters: prompt.length, estimatedTokens: 12 });
  render(<InitialPromptPage />);
  expect((await screen.findByLabelText('Full system prompt')).textContent).toBe(prompt);
  expect(document.querySelector('script')).toBeNull();
  expect(request).toHaveBeenCalledWith('/agent/aa/initialPrompt', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(request.mock.calls.every(call => !call[1].method)).toBe(true);
});
it('shows authorization failure without prompt content', async () => {
  window.history.replaceState({}, '', '/?promptAgent=aa');
  request.mockRejectedValue(new Error('Not Found')); render(<InitialPromptPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Not Found');
  expect(screen.queryByLabelText('Full system prompt')).toBeNull();
});
it('does not request malformed identifiers', () => {
  window.history.replaceState({}, '', '/?promptAgent=../aa'); render(<InitialPromptPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid agent identifier'); expect(request).not.toHaveBeenCalled();
});
