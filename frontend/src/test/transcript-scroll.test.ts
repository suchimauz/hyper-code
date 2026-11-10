import { expect, it } from 'vitest';
import { captureTranscriptAnchor, restoreTranscriptAnchor } from '../components/mauzcode/transcriptScroll';
it('preserves semantic reader position across changing content above the viewport', () => {
  const root = document.createElement('div');
  root.innerHTML = '<div data-event-idx="1" hidden></div><div data-event-idx="2"></div>';
  root.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  let top = 110;
  const node = root.lastElementChild as HTMLElement;
  node.getBoundingClientRect = () => ({ top, bottom: top + 40 } as DOMRect);
  const anchor = captureTranscriptAnchor(root);
  expect(anchor).toEqual({ idx: '2', offset: 10 });
  top = 70;
  root.scrollTop = 200;
  expect(restoreTranscriptAnchor(root, anchor)).toBe(true);
  expect(root.scrollTop).toBe(160);
  node.hidden = true;
  expect(restoreTranscriptAnchor(root, anchor)).toBe(false);
});
