import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantHtml } from './AssistantHtml';
import { TranscriptMessage } from './TranscriptMessage';

describe('explicit assistant HTML answers', () => {
  it('renders semantic content without showing the plain-text fallback', () => {
    render(<TranscriptMessage agentId="a" event={{ idx: 1, ts: 1, type: 'assistant', htmlSource: 'assistant-answer', html: "<h2>Result</h2><table><tbody><tr><td>42</td></tr></tbody></table>", text: 'Fallback answer' }} />);
    expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy();
    expect(screen.getByRole('cell').textContent).toBe('42');
    expect(screen.queryByText('Текстовая версия ответа')).toBeNull();
    expect(screen.queryByText('Fallback answer')).toBeNull();
  });
  it('does not transfer executable, network or host action markup into the DOM', () => {
    const { container } = render(<AssistantHtml html={`<base href="https://evil.test"><script>alert(1)</script><style>*{display:none}</style><img src="https://evil.test/pixel" onerror="alert(1)"><iframe srcdoc="evil"></iframe><svg onload="alert(1)"><a href="javascript:alert(1)">SVG</a></svg><math><mtext>bad</mtext></math><form action="/delete"><input autofocus></form><div id="main" class="host" style="background:url(https://evil.test)" hx-get="/delete" onclick="alert(1)"><a href="javascript:alert(1)" ping="https://evil.test">Visible label</a><custom-action data-action="delete">plain</custom-action></div>`} />);
    expect(container.querySelector('script,style,img,iframe,svg,math,form,input,base,custom-action')).toBeNull();
    expect(container.querySelector('[onclick],[onerror],[hx-get],[href],[src],[style],[ping],#main,.host')).toBeNull();
    expect(screen.getByText('Visible label')).toBeTruthy();
  });
  it('gates rendering by both assistant role and explicit transport marker', () => {
    const base = { idx: 1, ts: 1, text: 'Plain fallback', html: '<h1>Authored answer</h1>' };
    const { rerender } = render(<TranscriptMessage agentId="a" event={{...base, type:'assistant'}} />);
    expect(screen.queryByRole('heading', {name:'Authored answer'})).toBeNull();
    rerender(<TranscriptMessage agentId="a" event={{...base, type:'user', htmlSource:'assistant-answer'}} />);
    expect(screen.queryByRole('heading', {name:'Authored answer'})).toBeNull();
    rerender(<TranscriptMessage agentId="a" event={{...base, type:'assistant', htmlSource:'assistant-answer'}} />);
    expect(screen.getByRole('heading', {name:'Authored answer'})).toBeTruthy();
  });
});
