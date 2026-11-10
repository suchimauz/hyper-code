import { useState } from 'react';
import { X } from 'lucide-react';
import { attachmentMeta, imagePreviewSize, isPreviewImage, type AttachmentItem } from '../../lib/attachments';
import './attachments.css';

/** Ordered image thumbnail or file card, shared by draft and saved-message attachments. */
export function AttachmentCard({ item, draft = false, compact = false, disabled = false, onRemove, onPreview }: { item: AttachmentItem; draft?: boolean; compact?: boolean; disabled?: boolean; onRemove?: () => void; onPreview: (item: AttachmentItem) => void }) {
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<ReturnType<typeof imagePreviewSize> | null>(null);
  const image = isPreviewImage(item.type, item.name) && !!item.url && !failed;
  const body = <><svg className="attachment-file-icon" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M7 1h10l9 9v13a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5a4 4 0 0 1 5-4Z" fill="currentColor" /><path d="M17 1v6a3 3 0 0 0 3 3h6" fill="var(--text-tertiary)" /></svg><span className="attachment-file-body"><span className="attachment-file-name">{item.name}</span><span className="attachment-file-meta">{failed ? 'Превью недоступно · ' : ''}{attachmentMeta(item.name, item.size)}</span></span></>;
  return <div className={`attachment-item ${image ? 'attachment-item--image' : 'attachment-item--file'}`}>
    {image ? <button type="button" className="attachment-image" data-variant={draft ? 'draft' : compact ? 'tile' : 'single'} aria-label={`Открыть изображение ${item.name}`} title="Посмотреть оригинал" style={!draft && !compact && size ? { width: size.width, height: size.height } : undefined} onClick={() => onPreview(item)}>
      <img src={item.url} alt={item.name} draggable={false} onLoad={event => { const img = event.currentTarget; setSize(imagePreviewSize(img.naturalWidth, img.naturalHeight)); }} onError={() => setFailed(true)} style={{ objectPosition: size?.objectPosition }} />
    </button> : !draft && item.url ? <a className="attachment-file-card" href={item.url} target="_blank" rel="noreferrer" title={item.name}>{body}</a> : <div className="attachment-file-card" title={item.name}>{body}{!draft && !item.url && <span className="sr-only">Вложение недоступно</span>}</div>}
    {draft && onRemove && <button type="button" className="attachment-remove" aria-label={`Убрать ${item.name}`} disabled={disabled} onClick={onRemove}><X size={12} strokeWidth={1} /></button>}
  </div>;
}
