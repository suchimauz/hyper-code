import type { ReactNode } from 'react';
import { WidthViewport } from './WidthViewport';

/** Host-level sizing for native and SDK pages; chat and secondary Canvas keep their layouts. */
export function PageViewport({ active, children }: { active: boolean; children: ReactNode }) {
  return active ? <WidthViewport kind="page">{children}</WidthViewport> : <>{children}</>;
}
