import { useState } from 'react';
import type { AttachmentItem, ChatAttachment } from '../../lib/attachments';
import { AttachmentCard } from './AttachmentCard';
import { ImageViewer } from './ImageViewer';

export function MessageAttachments({ attachments, agentId }: { attachments: ChatAttachment[]; agentId: string }) {
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  return <><div className="message-attachments" aria-label="Вложения" role="group">{attachments.map((file, index) => {
    const item: AttachmentItem = { key: file.id || `missing-${index}`, name: file.name || 'Вложение', size: file.size, type: file.contentType || '', url: file.id ? `/attachments/${encodeURIComponent(agentId)}/${encodeURIComponent(file.id)}` : undefined };
    return <AttachmentCard key={item.key} item={item} compact={attachments.length > 1} onPreview={setPreview} />;
  })}</div><ImageViewer image={preview} onClose={() => setPreview(null)} /></>;
}
