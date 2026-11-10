import { createElement, useMemo, type ReactNode } from 'react';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

// Parse without a browser DOM: even discarded images/frames cannot initiate requests.
// Rebuild semantic elements only. No HTML injection, styles, classes, IDs, event
// handlers, URLs, custom elements, SVG, MathML or host action attributes survive.
const allowed = new Set('p div span section article h1 h2 h3 h4 h5 h6 strong b em i u s del small sub sup blockquote pre code ul ol li dl dt dd table caption thead tbody tfoot tr th td br hr details summary a'.split(' '));
const dropped = new Set('script style iframe frame object embed template noscript svg math form input button select textarea img video audio source link meta base'.split(' '));
type HtmlNode = DefaultTreeAdapterMap['childNode'];
function renderNode(node: HtmlNode, key: number, depth = 0): ReactNode {
  if (depth > 80) return null;
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  if (!('tagName' in node)) return null;
  if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || dropped.has(node.tagName)) return null;
  const children = node.childNodes.map((child, index) => renderNode(child, index, depth + 1));
  if (!allowed.has(node.tagName)) return children;
  // Links intentionally become text: authored HTML cannot navigate to internal
  // mutation endpoints or external tracking URLs. The plain-text fallback is kept for history/LLM context only.
  const tag = node.tagName === 'a' ? 'span' : node.tagName;
  return createElement(tag, { key }, ...children);
}

/** Only TranscriptMessage's explicit assistant-answer branch may use this renderer. */
export function AssistantHtml({ html }: { html: string }) {
  const content = useMemo(() => parseFragment(html.slice(0, 200000)).childNodes.map((child, index) => renderNode(child, index)), [html]);
  return <div className="assistant-html-answer">
    <div className="markdown" role="region" aria-label="Ответ в формате HTML">{content}</div>
  </div>;
}
