import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SecureInputHost } from './SecureInputHost';
vi.mock('../../lib/hyper', () => ({ requestJson: vi.fn(async () => ({ inputs: [{id:'s',kind:'secret',title:'Secret'},{id:'r',kind:'redmine-approval',title:'Approve'}] })) }));
afterEach(cleanup);
test('secret opens isolated document only after click; approval uses top-level protected page', async () => {
 const {container}=render(<SecureInputHost agentId="a" />);
 const button=await screen.findByRole('button',{name:/Secret/});
 expect(container.querySelector('iframe')).toBeNull();
 fireEvent.click(button);
 const frame=container.querySelector('iframe')!;
 expect(frame.getAttribute('src')).toBe('/input/compat?agentId=a&id=s&theme=light');
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
 expect(frame.hasAttribute('srcdoc')).toBe(false);
 const link=screen.getByRole('link');expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('href')).toContain('id=r');
});
