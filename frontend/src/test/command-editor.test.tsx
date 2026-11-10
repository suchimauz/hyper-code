import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandEditor, type CommandEditorHandle } from '../components/mauzcode/CommandEditor';

function at(el: HTMLElement, position: number) {
  const range = document.createRange(); const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) { const length = node.textContent!.length; if (position <= length && !node.parentElement?.hasAttribute('data-composer-command')) { range.setStart(node, position); break; } position -= length; node = walker.nextNode(); }
  if (!node) { range.selectNodeContents(el); range.collapse(false); } else range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
}
function Fixture({ initial = '/plan ', claim = true }: { initial?: string; claim?: boolean }) {
  const [value, setValue] = useState(initial); const [command, setCommand] = useState<{name:string}|null>(claim ? {name:'plan'} : null);
  return <><CommandEditor value={value} onChange={setValue} claimedCommand={command} onRelease={() => setCommand(null)} aria-label="Editor"/><output data-testid="value">{value}</output></>;
}
const paste = (el: HTMLElement, text: string) => fireEvent.paste(el, { clipboardData: { files: [], getData: (format: string) => format === 'text/plain' ? text : '<b>unsafe</b>' } });
describe('CommandEditor', () => {
  it('removes separator, then selects adjacent chip, then deletes it atomically', () => {
    render(<Fixture/>); const el = screen.getByRole('textbox'); at(el, 6);
    fireEvent.keyDown(el, {key:'Backspace'});
    expect(el.querySelector('[data-selected="true"]')).toBeNull(); expect(el.textContent).toBe('/plan');
    fireEvent.keyDown(el, {key:'Backspace'});
    expect(el.querySelector('[data-selected="true"]')).toHaveTextContent('/plan');
    fireEvent.keyDown(el, {key:'Backspace'});
    expect(el.textContent).toBe(''); expect(el.querySelector('[data-composer-command]')).toBeNull();
  });
  it('copies atomic selection only as canonical plain text', () => {
    render(<Fixture/>); const el = screen.getByRole('textbox'); at(el, 6); fireEvent.keyDown(el, {key:'Backspace'}); fireEvent.keyDown(el, {key:'Backspace'});
    const setData = vi.fn(); fireEvent.copy(el, {clipboardData:{setData}});
    expect(setData.mock.calls).toEqual([['text/plain','/plan']]);
  });
  it('pastes plain multiline text without claiming arbitrary slash commands', () => {
    render(<Fixture initial="" claim={false}/>); const el = screen.getByRole('textbox'); paste(el, '/plan x\r\ny');
    expect(el.textContent).toBe('/plan x\ny'); expect(el.querySelector('[data-composer-command]')).toBeNull();
  });
  it('keeps canonical args and replaces selected text on paste', () => {
    render(<Fixture initial="/plan hello"/>); const el = screen.getByRole('textbox'); at(el, 11); paste(el, '\nworld');
    expect(el.textContent).toBe('/plan hello\nworld'); expect(el.querySelector('[data-composer-command]')).not.toBeNull();
  });
  it('releases claim when text is inserted before the chip', () => {
    render(<Fixture/>); const el = screen.getByRole('textbox'); const range = document.createRange(); range.setStart(el,0); range.collapse(true); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    paste(el,'before '); expect(el.textContent).toBe('before /plan '); expect(el.querySelector('[data-composer-command]')).toBeNull();
  });
  it('syncs controlled updates and exposes canonical caret offsets', () => {
    const ref = createRef<CommandEditorHandle>(); const props = {onChange:vi.fn(),onRelease:vi.fn(),claimedCommand:{name:'plan'}};
    const ui = render(<CommandEditor {...props} ref={ref} value="/plan a"/>); const el = screen.getByRole('textbox');
    at(el,7); expect(ref.current!.selectionStart()).toBe(7);
    ui.rerender(<CommandEditor {...props} ref={ref} value={'/plan updated\nargs'}/>); expect(el.textContent).toBe('/plan updated\nargs');
    ui.rerender(<CommandEditor {...props} ref={ref} value=""/>); expect(el.textContent).toBe(''); expect(props.onRelease).toHaveBeenCalled();
  });
  it('does not delegate composing Enter or process atomic deletion while composing', () => {
    const onKeyDown = vi.fn(); const onChange = vi.fn(); render(<CommandEditor value="/plan " claimedCommand={{name:'plan'}} onRelease={vi.fn()} onChange={onChange} onKeyDown={onKeyDown}/>);
    const el = screen.getByRole('textbox'); at(el,6); fireEvent.compositionStart(el); fireEvent.keyDown(el,{key:'Enter',isComposing:true}); fireEvent.keyDown(el,{key:'Backspace',isComposing:true}); fireEvent.input(el);
    expect(onKeyDown).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled(); expect(el.textContent).toBe('/plan ');
    fireEvent.compositionEnd(el); expect(onChange).toHaveBeenCalledWith('/plan ');
  });
  it.each(['', 'hello', '/plan '])('renders the first trailing newline without adding it twice to the value: %j', (initial) => {
    render(<Fixture initial={initial} claim={initial.startsWith('/plan')}/>);
    const el = screen.getByRole('textbox'); at(el, initial.length);
    fireEvent.keyDown(el, { key: 'Enter', shiftKey: true });
    expect(screen.getByTestId('value').textContent).toBe(initial + '\n');
    expect(el.querySelector('br[data-editor-tail]')).not.toBeNull();
    fireEvent.input(el);
    expect(screen.getByTestId('value').textContent).toBe(initial + '\n');
    fireEvent.keyDown(el, { key: 'Enter', shiftKey: true });
    expect(screen.getByTestId('value').textContent).toBe(initial + '\n\n');
    paste(el, 'next');
    expect(screen.getByTestId('value').textContent).toBe(initial + '\n\nnext');
    expect(el.querySelector('[data-editor-tail]')).toBeNull();
  });
  it('delegates Enter and inserts newline only when parent does not prevent it', () => {
    const onChange=vi.fn(); const onKeyDown=vi.fn((event: React.KeyboardEvent<HTMLDivElement>)=>{if(!event.shiftKey)event.preventDefault();});
    render(<CommandEditor value="hello" onChange={onChange} claimedCommand={null} onRelease={vi.fn()} onKeyDown={onKeyDown}/>); const el=screen.getByRole('textbox'); at(el,5);
    fireEvent.keyDown(el,{key:'Enter'}); expect(onChange).not.toHaveBeenCalled(); fireEvent.keyDown(el,{key:'Enter',shiftKey:true}); expect(onChange).toHaveBeenCalledWith('hello\n');
  });
});
