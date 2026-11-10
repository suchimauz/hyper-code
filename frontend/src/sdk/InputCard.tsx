import { useId, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import '../styles/scrollbar.css';
import '../styles/questions.css';
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
  /** Allow collapsing the card to its title, like native Hyper questions. @default true */
  minimizable?: boolean;
};

/** The native Hyper chat input frame for plugin cards: same header, body, footer, collapse and tokens as built-in questions. */
export function InputCard({ label, hint, title, message, children, note, actions, error, busy = false, onSubmit, minimizable = true }: InputCardProps) {
  const titleId = useId();
  const [minimized, setMinimized] = useState(false);
  const toggle = () => setMinimized(value => !value);
  const content = <>
    {minimized && <button type="button" className="question-expand-strip" aria-label="Развернуть форму" aria-expanded={false} onClick={toggle}><ChevronDown size={16} aria-hidden="true" /></button>}
    <header className="question-header"><span>{label}</span>{hint && <span>{hint}</span>}{!minimized && minimizable && <button type="button" className="question-minimize" aria-label="Свернуть форму" aria-expanded={true} onClick={toggle}><ChevronUp size={16} /></button>}</header>
    <h2 id={titleId}>{minimized ? <span className="question-copy-clamped">{title}</span> : title}</h2>
    <div className="question-body hyper-input-card-body" hidden={minimized}>
      {message && <p className="question-message">{message}</p>}
      {children}
    </div>
    {!minimized && error && <p className="question-error" role="alert">{error}</p>}
    {(note || actions) && <footer className="question-footer" hidden={minimized}><span>{note}</span>{actions && <span className="confirm-actions">{actions}</span>}</footer>}
  </>;
  const className = `question-card hyper-input-card${minimized ? ' is-minimized' : ''}`;
  return <div className="question-frame">{onSubmit
    ? <form className={className} aria-labelledby={titleId} aria-busy={busy} noValidate={false} onSubmit={event => { event.preventDefault(); onSubmit(event); }}>{content}</form>
    : <section className={className} aria-labelledby={titleId} aria-busy={busy}>{content}</section>}</div>;
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
  return <label className={`hyper-input-field${wide ? ' is-wide' : ''}`}><span className="hyper-input-field-label">{label}</span>{children}{description && <span className="hyper-input-field-help">{description}</span>}</label>;
}
/** Grid of InputCardField slots, two columns on wide cards. */
export function InputCardFields({ children }: { children: ReactNode }) { return <div className="hyper-input-fields">{children}</div>; }

export type InputCardFact = { label: string; value: ReactNode; wide?: boolean };
/** Read-only label/value list for exact previews, e.g. what will be sent after confirmation. */
export function InputCardFacts({ items }: { items: readonly InputCardFact[] }) {
  return <dl className="hyper-input-facts">{items.map((item, index) => <div key={index} className={item.wide ? 'is-wide' : undefined}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
