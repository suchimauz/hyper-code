/** Semantic reading anchor survives folding and prepending without guessing height deltas. */
export type TranscriptAnchor = { idx: string; offset: number };
export function captureTranscriptAnchor(root: HTMLElement): TranscriptAnchor | null {
  const top = root.getBoundingClientRect().top;
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-event-idx]')];
  const node = nodes.find(node => !node.closest('[hidden]') && node.getBoundingClientRect().bottom > top);
  return node ? { idx: node.dataset.eventIdx!, offset: node.getBoundingClientRect().top - top } : null;
}
export function restoreTranscriptAnchor(root: HTMLElement, anchor: TranscriptAnchor | null) {
  if (!anchor) return false;
  const node = root.querySelector<HTMLElement>(`[data-event-idx="${anchor.idx}"]`);
  if (!node || node.closest('[hidden]')) return false;
  root.scrollTop += node.getBoundingClientRect().top - root.getBoundingClientRect().top - anchor.offset;
  return true;
}
