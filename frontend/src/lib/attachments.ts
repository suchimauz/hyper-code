export type ChatAttachment = { id: string | null; name: string | null; size: number | null; contentType?: string | null };
export type AttachmentItem = { key: string; name: string; size: number | null; type: string; url?: string };
/** Render inert raster formats only; SVG/HTML remain ordinary downloadable files. */
export function isPreviewImage(type: string, name = ''): boolean {
  if (type) return /^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(type);
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name);
}
export function attachmentMeta(name: string, size: number | null): string {
  const extension = name.includes('.') ? name.split('.').pop()!.slice(0, 8).toUpperCase() : 'FILE';
  if (size == null) return extension;
  const unit = size < 1024 ? `${size}B` : size < 1024 ** 2 ? `${+(size / 1024).toFixed(1)}KB` : `${+(size / 1024 ** 2).toFixed(1)}MB`;
  return `${extension} ${unit}`;
}
/** dsh singleFit: longest edge 240px, aspect clamped to 1:4–4:1, no upscaling. */
export function imagePreviewSize(width: number, height: number) {
  const natural = width / height;
  const ratio = Math.min(4, Math.max(.25, natural));
  const w = ratio >= 1 ? 240 : 240 * ratio;
  const h = ratio >= 1 ? 240 / ratio : 240;
  const scale = Math.min(1, width / w, height / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), objectPosition: natural < .25 ? 'center top' : natural > 4 ? 'left center' : 'center' };
}
export function attachmentLimitError(files: File[]): string {
  return files.length > 10 || files.some(file => file.size > 40 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024 ? 'Не более 10 файлов, до 40 МБ каждый и 80 МБ суммарно.' : '';
}
