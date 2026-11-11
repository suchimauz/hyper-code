import type { ButtonHTMLAttributes, FormEvent, ReactNode } from 'react';
import { InputFrame } from '../components/mauzcode/inputs/InputFrame';
import './input-card.css';

export type InputCardProps = {
  /** Small header caption on the left, e.g. "Подтверждение" or "Redmine · Время". */
  label: string;
  /** Optional header caption on the right, e.g. "Да или нет". */
  hint?: string;
  /** Card heading; keep it short. */
  title: ReactNode;
  /** Secondary copy under the heading. */
  message?: ReactNode;
  /** Card body: fields, facts or any custom content. */
  children?: ReactNode;
  /** Footer caption on the left; defaults to nothing. */
  note?: ReactNode;
  /** Footer buttons on the right; use InputCardAction. */
  actions?: ReactNode;
  /** Error shown above the footer with role="alert". */
  error?: string;
  /** Marks the card busy for assistive technology. */
  busy?: boolean;
  /** When set the card is a form and Enter in single-line fields submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Allow collapsing the card to its title, like native MauzCode questions. @default true */
  minimizable?: boolean;
};

/** The native MauzCode chat input frame for plugin cards: the same InputFrame the built-in questions and batch render through. */
export function InputCard({ label, hint, title, message, children, note, actions, error, busy = false, onSubmit, minimizable = true }: InputCardProps) {
  return <InputFrame className="mauzcode-input-card" bodyClassName="mauzcode-input-card-body" label={label} hint={hint} title={title} message={message} note={note} actions={actions} error={error} busy={busy} onSubmit={onSubmit} minimizable={minimizable}>{children}</InputFrame>;
}

export type InputCardActionProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };
/** Footer button with the native question styles: primary (filled), secondary (outlined) or danger. */
export function InputCardAction({ variant = 'primary', className = '', type = 'button', ...props }: InputCardActionProps) {
  const style = variant === 'secondary' ? 'confirm-decline' : variant === 'danger' ? 'confirm-accept is-danger' : 'confirm-accept';
  return <button type={type} className={`${style} ${className}`.trim()} {...props} />;
}

export type InputCardFieldProps = { label: string; description?: string; wide?: boolean; children: ReactNode };
/** Labelled field slot: wrap a native input, select or textarea; it gets the card's control styling. */
export function InputCardField({ label, description, wide = false, children }: InputCardFieldProps) {
  return <label className={`mauzcode-input-field${wide ? ' is-wide' : ''}`}><span className="mauzcode-input-field-label">{label}</span>{children}{description && <span className="mauzcode-input-field-help">{description}</span>}</label>;
}
/** Grid of InputCardField slots, two columns on wide cards. */
export function InputCardFields({ children }: { children: ReactNode }) { return <div className="mauzcode-input-fields">{children}</div>; }

export type InputCardFact = { label: string; value: ReactNode; wide?: boolean };
/** Read-only label/value list for exact previews, e.g. what will be sent after confirmation. */
export function InputCardFacts({ items }: { items: readonly InputCardFact[] }) {
  return <dl className="mauzcode-input-facts">{items.map((item, index) => <div key={index} className={item.wide ? 'is-wide' : undefined}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
