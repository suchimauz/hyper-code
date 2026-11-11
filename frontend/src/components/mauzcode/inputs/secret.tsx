import type { ReactNode, Ref } from 'react';

/** Secret content only: the isolated same-origin field document and a hint. The value never enters React. */
export function SecretBody({ frameRef, title, src, hint, height }: { frameRef: Ref<HTMLIFrameElement>; title: string; src: string; hint: ReactNode; /** Frame height for a field document with its own label/status. */ height?: number }) {
  return <>
    <iframe ref={frameRef} className="secret-field-frame" title={title} src={src} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin" style={height ? { height } : undefined} />
    <p className="secret-hint">{hint}</p>
  </>;
}

/** Secret footer buttons for a standalone secret form. */
export function SecretActions({ busy = false, disabled = false, onSubmit, onCancel }: { busy?: boolean; disabled?: boolean; onSubmit: () => void; onCancel: () => void }) {
  return <span className="confirm-actions">
    <button type="button" className="confirm-decline" disabled={disabled} onClick={onCancel}>Отмена</button>
    <button type="button" className="confirm-accept" disabled={disabled} onClick={onSubmit}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
  </span>;
}

export const secretModeLabel = (mode?: unknown) => mode === 'otp' ? 'Одноразовый код' : mode === 'text' ? 'Скрытое значение' : 'Пароль или ключ';
