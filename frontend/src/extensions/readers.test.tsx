import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readersExtension } from '../ui-plugins/readers';
const request = vi.hoisted(() => vi.fn());
vi.mock('@hyper/ui', () => ({
  requestJson: request,
  Panel: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h1>{title}</h1>{children}</section>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  TextField: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label>{label}<input {...props} /></label>,
}));
afterEach(() => { cleanup(); request.mockReset(); window.history.replaceState({}, '', '/'); });
function page(id: string) {
  const Page = readersExtension.pages!.find(p => p.id === id)!.component;
  return render(<Page context={{ agentId: null, theme: 'dark', readOnly: true }} />);
}
describe('native readers', () => {
  it('renders Hacker News and rejects executable article links', async () => {
    request.mockResolvedValue({ feeds: [{ key: 'front', label: 'Front', stories: 1 }], stories: [{ id: 42, title: 'Unsafe link', url: 'javascript:alert(1)', points: 3, comments: 2, author: 'reader' }] });
    page('hackernews');
    expect(await screen.findByText('Unsafe link')).not.toHaveAttribute('href');
    expect(screen.getByRole('link', { name: '2 comments' })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=42');
    expect(request).toHaveBeenCalledWith('/hackernews?feed=front', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('opens mirrored Substack publications without syncing or importing', async () => {
    request.mockResolvedValueOnce({ publications: [{ key: 'one', name: 'One', host: 'one.substack.com', posts: 1 }] }).mockResolvedValueOnce({ publication: { name: 'One' }, posts: [{ id: 1, title: 'Article', url: 'https://one.substack.com/p/one' }] });
    page('substack'); fireEvent.click(await screen.findByRole('button', { name: 'One' }));
    expect(await screen.findByRole('link', { name: 'Article' })).toHaveAttribute('target', '_blank');
    expect(request.mock.calls.map(call => call[0])).toEqual(['/substack', '/substack/one']);
  });
  it('filters and opens quarantined mail as text', async () => {
    const mail = { id: 'a', direction: 'in', subject: 'Hello', text: '<script>bad()</script>', from: 'x', to: ['y'], verified: false, receivedAt: 1, hop: 0, reason: 'Unknown key' };
    request.mockResolvedValueOnce({ messages: [mail] }).mockResolvedValueOnce({ message: mail, thread: [mail] });
    page('inbox'); fireEvent.click(await screen.findByRole('button', { name: 'Hello' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy());
    expect(screen.getByText('<script>bad()</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Unknown key')).toBeTruthy();
    expect(request.mock.calls.every(call => !call[1].method)).toBe(true);
  });
  it('shows authorization errors', async () => {
    request.mockRejectedValue(new Error('Unauthorized')); page('inbox');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized');
  });
});
