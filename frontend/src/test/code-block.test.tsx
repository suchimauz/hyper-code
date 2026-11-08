import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatMarkdown } from '../components/hyper/ChatMarkdown';
import { ToolBody } from '../components/hyper/ToolBody';
import { CodeBlock } from '../components/hyper/CodeBlock';
import { codeLanguage } from '../lib/codeLanguage';
import { highlightCode } from '../lib/highlightCode';
import { readCodeLines } from '../components/hyper/ToolPreview';

afterEach(() => vi.unstubAllGlobals());
it('resolves language aliases, Clojure files, JSON and inspected objects without guessing prose', () => {
  expect(codeLanguage('ts')).toBe('typescript'); expect(codeLanguage('', 'src/view.cljc')).toBe('clojure');
  expect(codeLanguage('', '', '{"ok": true}')).toBe('json'); expect(codeLanguage('', '', '{ ok: true }')).toBe('javascript');
  expect(codeLanguage('', '', 'Done: 2 files')).toBe('text');
});
it('tokenizes TS, Clojure, shell and JSON with CSS variables and preserves source exactly', async () => {
  for (const [language, text] of [['typescript', 'const answer: number = 42;'], ['clojure', '(defn greet [name] (str "Hi " name))'], ['shellscript', 'echo "$HOME"'], ['json', '{"ok": true}']]) {
    const tokens = await highlightCode(text, language);
    expect(tokens?.flat().map(token => token.content).join('')).toBe(text);
    expect(tokens?.flat().some(token => token.color?.includes('--syntax-token-'))).toBe(true);
  }
  expect(await highlightCode('hello', 'unknown')).toBeNull();
  expect(await highlightCode('x'.repeat(100001), 'typescript')).toBeNull();
});
it('renders fenced and indented code cards safely, leaving inline code inline', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const view = render(<ChatMarkdown>{'Inline `x`\n\n```ts\nconst answer = "<img src=x onerror=alert(1)>";\n```\n\n    plain code'}</ChatMarkdown>);
  expect(view.container.querySelectorAll('.code-block')).toHaveLength(2);
  expect([...view.container.querySelectorAll('.syntax-gutter')].map(el => el.textContent)).toEqual(['1', '1']);
  expect(view.container.querySelector('p > code')).toHaveTextContent('x');
  expect(view.container.querySelector('img')).toBeNull();
  await waitFor(() => expect(view.container.querySelector('[data-language="typescript"]')).toHaveAttribute('data-highlighted', 'true'));
});
it('copies exact source, toggles wrap and reports clipboard failure', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const view = render(<CodeBlock text={'const x = 1;\nconsole.log(x);'} language="ts" numbered />);
  fireEvent.click(screen.getByRole('button', { name: 'Перенос строк' }));
  expect(view.container.firstChild).toHaveAttribute('data-code-wrap', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Копировать код' }));
  expect(writeText).toHaveBeenCalledWith('const x = 1;\nconsole.log(x);');
  await screen.findByRole('button', { name: 'Скопировано' });
  writeText.mockRejectedValueOnce(new Error('Denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Скопировано' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Не удалось');
});
it('highlights read anchors and edit source without sacrificing diff backgrounds', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  expect(readCodeLines('12ab|const x = 1;\n13cd|console.log(x);')).toEqual({text:'const x = 1;\nconsole.log(x);',lineNumbers:['12ab','13cd']});
  const details = { idx:1, type:'tool_call', ts:1, name:'edit', args:'{}', result:'done', isError:false, argsTruncated:false, resultTruncated:false };
  const view = render(<ToolBody details={details} kind="edit" args={{path:'test.ts',edits:[{oldText:'const x = 1;',newText:'const x = 2;'}]}} />);
  expect(view.container.querySelector('.tool-row-added')).not.toBeNull(); expect(view.container.querySelector('.tool-row-removed')).not.toBeNull();
  await waitFor(() => expect(view.container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(2));
});
it('keeps streaming and unknown code readable before highlighting', () => {
  const view = render(<ChatMarkdown>{'```unknown\nfirst'}</ChatMarkdown>);
  expect(view.container.querySelector('pre')).toHaveTextContent('first');
  view.rerender(<ChatMarkdown>{'```unknown\nsecond'}</ChatMarkdown>);
  expect(view.container.querySelector('pre')).toHaveTextContent('second');
  expect(view.container.querySelector('pre')).not.toHaveTextContent('first');
});
it('shows eval language headers and highlighted input/output, including Clojure nREPL', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const details = { idx: 1, type: 'tool_call', ts: 1, name: 'tools_eval', args: '{}', result: '{ ok: true, count: 42 }', isError: false, argsTruncated:false, resultTruncated:false };
  const view = render(<ToolBody details={details} kind="tools_eval" args={{code:Array.from({length:20}, (_,i) => `const count${i} = ${i};`).join('\n')}} />);
  expect(screen.getByText('typescript')).toBeVisible(); expect(screen.getByText('javascript')).toBeVisible();
  expect(screen.queryByRole('button', {name:/Показать все/})).toBeNull();
  expect(view.container.querySelector('[data-language=typescript]')).toHaveTextContent('const count19 = 19;');
  await waitFor(() => expect(view.container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(2));
  view.rerender(<ToolBody details={{...details,name:'nrepl.eval',result:'42'}} kind="eval" args={{code:'(+ 20 22)'}} />);
  expect(screen.getByText('clojure')).toBeVisible();
  await waitFor(() => expect(view.container.querySelector('[data-language="clojure"]')).toHaveAttribute('data-highlighted','true'));
});
it('keeps indentation when separating hash anchors', () => {
  expect(readCodeLines('12ab|  const x = 1;').text).toBe('  const x = 1;');
});

