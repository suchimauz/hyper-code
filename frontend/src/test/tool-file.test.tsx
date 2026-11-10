import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolRow } from '../components/mauzcode/ToolRow';
import { toolFileTarget } from '../components/mauzcode/toolFileTarget';
const event = { idx: 3, ts: 1, type: 'tool_call', name: 'read', text: null, preview: 'wrong guessed path' };
const detail = { ...event, args: '{"path":"src/real.ts","host":"home-dev"}', argsTruncated: false, result: '', resultTruncated: false, isError: false };
afterEach(() => vi.unstubAllGlobals());
it('only uses explicit read/edit/write paths and preserves host', () => {
  for (const name of ['read', 'files.write', 'tools.edit']) expect(toolFileTarget(name, { path:'a', host:'local' })).toEqual({path:'a',host:'local'});
  for (const name of ['grep','find','bash','eval','bread']) expect(toolFileTarget(name, {path:'a'})).toBeNull();
  expect(toolFileTarget('read',{file_path:'b'})).toEqual({path:'b'});
  expect(toolFileTarget('read',{code:'read("a")',url:'https://example.com'})).toBeNull();
});
it('opens Canvas with structured args without expanding or navigating; supports keyboard', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}',{headers:{'content-type':'application/json'}})); vi.stubGlobal('fetch',fetcher);
  const { container } = render(<ToolRow event={event} agentId="fixture" initialDetails={detail}/>);
  const button = screen.getByRole('button',{name:'Открыть в Canvas: src/real.ts'});
  button.focus(); await userEvent.keyboard('{Enter}');
  expect(fetcher).toHaveBeenCalledWith('/canvas/fixture',expect.objectContaining({method:'POST',body:JSON.stringify({show:{kind:'file',args:{path:'src/real.ts',host:'home-dev'}}})}));
  expect(screen.getByRole('button',{name:'Read'})).toHaveAttribute('aria-expanded','false');
  expect(container.querySelector('button button')).toBeNull();
});
it('does not link errors, stopped calls or truncated arguments', () => {
  const {rerender} = render(<ToolRow event={{...event,isError:true}} agentId="fixture" initialDetails={detail}/>);
  expect(screen.queryByRole('button',{name:/Открыть в Canvas/})).toBeNull();
  rerender(<ToolRow event={{...event,status:'interrupted'}} agentId="fixture" initialDetails={detail}/>);
  expect(screen.queryByRole('button',{name:/Открыть в Canvas/})).toBeNull();
});
it('does not link truncated argument payloads', () => {
  render(<ToolRow event={event} agentId="fixture" initialDetails={{...detail,argsTruncated:true}}/>);
  expect(screen.queryByRole('button',{name:/Открыть в Canvas/})).toBeNull();
});
it('shows Canvas failure inline', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('bad',{status:400})));
  render(<ToolRow event={event} agentId="fixture" initialDetails={detail}/>);
  await userEvent.click(screen.getByRole('button',{name:/Открыть в Canvas/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 400');
});

it.each(['read', 'write', 'edit', 'bash'])('toggles %s from blank header and timing, with independent accessible file action', async name => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<ToolRow event={{ ...event, name, durationMs: 1200 }} agentId="fixture" initialDetails={{ ...detail, name }} />);
  const header = container.querySelector('.tool-row-header')!;
  const disclosure = container.querySelector<HTMLButtonElement>('.tool-row-summary')!;
  const timing = container.querySelector('.tool-row-timing')!;
  const panel = document.getElementById(disclosure.getAttribute('aria-controls')!)!;
  await userEvent.click(header);
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(panel).toBeVisible();
  await userEvent.click(timing);
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(panel).not.toBeVisible();
  disclosure.focus();
  await userEvent.keyboard(' ');
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  if (name !== 'bash') {
    const file = screen.getByRole('button', { name: 'Открыть в Canvas: src/real.ts' });
    await userEvent.click(file);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(header);
    await userEvent.click(file);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/canvas/fixture/state', '/canvas/fixture', '/canvas/fixture/state', '/canvas/fixture']);
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(2);
    expect(fetcher).toHaveBeenLastCalledWith('/canvas/fixture', expect.objectContaining({ method: 'POST', body: JSON.stringify({ show: { kind: 'file', args: { path: 'src/real.ts', host: 'home-dev' } } }) }));
  }
  expect(timing.parentElement).toBe(header);
  expect(header.lastElementChild).toBe(timing);
  expect(container.querySelector('button button')).toBeNull();
});
