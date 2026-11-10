import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isPreviewImage, type AttachmentItem } from '../../lib/attachments';
import { AttachmentCard } from './AttachmentCard';
import { ImageViewer } from './ImageViewer';

/** Own local preview URLs only while files are attached. No uploads until Send. */
export function PendingAttachments({ files, disabled, onRemove }: { files: File[]; disabled?: boolean; onRemove: (index: number) => void }) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const next = files.map((file, index) => ({ key: `${index}-${file.name}-${file.lastModified}`, name: file.name, size: file.size, type: file.type, url: isPreviewImage(file.type, file.name) ? URL.createObjectURL(file) : undefined }));
    setItems(next); setPreview(null);
    return () => { next.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); }); };
  }, [files]);
  useEffect(() => {
    const element = rail.current; if (!element) return;
    element.scrollLeft = element.scrollWidth;
    const update = () => setEdges({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    update(); const observer = new ResizeObserver(update); observer.observe(element); element.addEventListener('scroll', update);
    const wheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth || !event.deltaY || event.ctrlKey) return;
      const delta = Math.sign(event.deltaY) * Math.min(60, Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1));
      const before = element.scrollLeft; element.scrollLeft += delta;
      if (before !== element.scrollLeft) event.preventDefault();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); element.removeEventListener('wheel', wheel); };
  }, [items]);
  const scroll = (direction: number) => { const element = rail.current; if (element) element.scrollBy({ left: direction * Math.max(element.clientWidth - 64, 200), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  return <div className="pending-attachments"><div ref={rail} className="attachment-rail" role="group" aria-label="Прикреплённые файлы">{items.map((item, index) => <AttachmentCard key={item.key} item={item} draft disabled={disabled} onRemove={() => onRemove(index)} onPreview={setPreview} />)}</div>
    {edges.left && <button type="button" className="attachment-scroll attachment-scroll--left" aria-label="Предыдущие вложения" onClick={() => scroll(-1)}><ChevronLeft size={14} /></button>}
    {edges.right && <button type="button" className="attachment-scroll attachment-scroll--right" aria-label="Следующие вложения" onClick={() => scroll(1)}><ChevronRight size={14} /></button>}
    <ImageViewer image={preview} onClose={() => setPreview(null)} />
  </div>;
}
