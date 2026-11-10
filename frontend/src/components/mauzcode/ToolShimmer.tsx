import type { ReactNode } from 'react';
/** One moving mask across the complete text group, with counter-moving glyphs. */
export function ToolShimmer({ text, children, className }: { text?: string; children?: ReactNode; className: string }) {
  const content = children ?? text;
  return <span className={`${className} tool-shimmer`}>{content}<span className="tool-sweep-band" aria-hidden="true"><span className="tool-sweep-glyphs">{content}</span></span></span>;
}
