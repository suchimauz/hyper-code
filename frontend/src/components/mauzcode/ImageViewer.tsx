import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { AttachmentItem } from '../../lib/attachments';
import './attachments.css';

/** In-chat original image preview; Base UI traps focus, restores it and handles Escape. */
export function ImageViewer({ image, onClose }: { image: AttachmentItem | null; onClose: () => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <Dialog.Root open={!!image} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="image-viewer-backdrop" /><Dialog.Popup className="image-viewer" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <Dialog.Title className="sr-only">Просмотр изображения: {image?.name}</Dialog.Title>
      <Dialog.Description className="sr-only">Оригинальное изображение. Escape — закрыть просмотр.</Dialog.Description>
      {image?.url && (failed === image.url ? <div className="image-viewer-error" role="alert">Не удалось загрузить изображение. <a href={image.url} target="_blank" rel="noreferrer">Открыть файл</a></div> : <img src={image.url} alt={image.name} onError={() => setFailed(image.url!)} />)}
      <Dialog.Close className="image-viewer-close" aria-label="Закрыть изображение"><X size={16} strokeWidth={1} /></Dialog.Close>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
