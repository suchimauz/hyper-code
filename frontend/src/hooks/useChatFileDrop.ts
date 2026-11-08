import { useEffect, useRef, useState, type RefObject } from 'react';

/** Accept external files anywhere in this chat panel, never navigate the browser to a dropped file. */
export function useChatFileDrop({ anchor, onFiles, disabled = false }: { anchor: RefObject<HTMLElement | null>; onFiles: (files: File[]) => void; disabled?: boolean }): boolean {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles); handler.current = onFiles;
  useEffect(() => {
    const panel = anchor.current?.closest('.chat-panel') || anchor.current;
    if (!panel) return;
    let depth = 0;
    const isFile = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    const enter = (event: Event) => { const drag = event as DragEvent; if (!isFile(drag)) return; drag.preventDefault(); if (++depth > 0 && !disabled) setDragging(true); };
    const over = (event: Event) => { const drag = event as DragEvent; if (isFile(drag)) { drag.preventDefault(); if (drag.dataTransfer) drag.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; } };
    const leave = (event: Event) => { if (!isFile(event as DragEvent)) return; if (--depth <= 0) { depth = 0; setDragging(false); } };
    const drop = (event: Event) => {
      const drag = event as DragEvent; if (!isFile(drag)) return;
      drag.preventDefault(); drag.stopPropagation(); depth = 0; setDragging(false);
      if (!disabled) handler.current(Array.from(drag.dataTransfer?.files || []));
    };
    const reset = () => { depth = 0; setDragging(false); };
    // Capture prevents the input's own drop fallback from adding the files twice.
    panel.addEventListener('dragenter', enter); panel.addEventListener('dragover', over); panel.addEventListener('dragleave', leave); panel.addEventListener('drop', drop, true); window.addEventListener('dragend', reset); window.addEventListener('blur', reset);
    return () => { panel.removeEventListener('dragenter', enter); panel.removeEventListener('dragover', over); panel.removeEventListener('dragleave', leave); panel.removeEventListener('drop', drop, true); window.removeEventListener('dragend', reset); window.removeEventListener('blur', reset); };
  }, [anchor, disabled]);
  return dragging && !disabled;
}
