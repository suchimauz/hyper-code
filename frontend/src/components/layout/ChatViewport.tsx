import type { ReactNode } from 'react';
import { WidthViewport } from './WidthViewport';

/** Chat keeps its own persisted width and composer/scroll measurements. */
export function ChatViewport(props: { children: ReactNode; disabled?: boolean; widthControlTarget?: HTMLElement | null }) {
  return <WidthViewport {...props} kind="chat" />;
}
