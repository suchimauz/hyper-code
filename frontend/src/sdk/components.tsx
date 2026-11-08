import { useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Button } from '../components/ui/Button';
import './sdk.css';
export { Button, type ButtonProps } from '../components/ui/Button';
export { IconButton, type IconButtonProps } from '../components/ui/IconButton';
/** Host navigation sheet. For general-purpose content prefer Dialog (Sheet has navigation semantics). */
export { Sheet, type SheetProps } from '../components/layout/Sheet';
export type StackProps = HTMLAttributes<HTMLDivElement> & { direction?: 'vertical' | 'horizontal'; gap?: 1 | 2 | 3 | 4 | 6; wrap?: boolean };
export function Stack({ direction = 'vertical', gap = 3, wrap = false, style, ...props }: StackProps) {
  return <div {...props} style={{ display: 'flex', flexDirection: direction === 'vertical' ? 'column' : 'row', gap: `var(--space-${gap})`, flexWrap: wrap ? 'wrap' : 'nowrap', minWidth: 0, ...style }} />;
}
export type PanelProps = HTMLAttributes<HTMLElement> & { title: string; actions?: ReactNode };
export function Panel({ title, actions, children, className = '', ...props }: PanelProps) {
  const id = useId();
  return <section {...props} aria-labelledby={id} className={`hyper-sdk-panel ${className}`}><header className="hyper-sdk-panel-header"><h2 id={id}>{title}</h2>{actions}</header>{children}</section>;
}
export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string; description?: string; error?: string; type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel' | 'number';
};
/** Native input with a persistent label and programmatically linked help/error text. */
export function TextField({ label, description, error, id, className = '', 'aria-describedby': describedBy, ...props }: TextFieldProps) {
  const generated = useId(); const inputId = id ?? generated;
  const helpId = `${inputId}-help`; const errorId = `${inputId}-error`;
  return <div className="hyper-sdk-field"><label htmlFor={inputId}>{label}</label><input {...props} id={inputId} className={`hyper-sdk-input ${className}`} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={[describedBy, description ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined} />{description && <p id={helpId}>{description}</p>}{error && <p id={errorId} className="hyper-sdk-error" role="alert">{error}</p>}</div>;
}
export type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; closeLabel?: string };
/** Accessible modal: Base UI owns focus trapping, Escape, focus return and outside dismissal. */
export function Dialog({ open, onOpenChange, title, description, children, closeLabel = 'Close' }: DialogProps) {
  return <BaseDialog.Root open={open} onOpenChange={value => onOpenChange(value)}><BaseDialog.Portal><BaseDialog.Backdrop className="hyper-sdk-dialog-backdrop" /><BaseDialog.Popup className="hyper-sdk-dialog"><header className="hyper-sdk-panel-header"><BaseDialog.Title>{title}</BaseDialog.Title><Button onClick={() => onOpenChange(false)}>{closeLabel}</Button></header>{description && <BaseDialog.Description>{description}</BaseDialog.Description>}{children}</BaseDialog.Popup></BaseDialog.Portal></BaseDialog.Root>;
}
