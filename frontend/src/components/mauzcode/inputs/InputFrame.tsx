import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import '../../../styles/scrollbar.css';
import '../../../styles/questions.css';

/** Long copy clamps to three lines with a local "Подробнее" toggle. */
export function QuestionCopy({ text, className = '' }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 3;
  return <span className={className}><span className={long && !expanded ? 'question-copy-clamped' : ''}>{text}</span>{long && <button type="button" className="question-copy-toggle" aria-expanded={expanded} onClick={event => { event.preventDefault(); setExpanded(value => !value); }}>{expanded ? 'Свернуть' : 'Подробнее'}</button>}</span>;
}

/** Plain Enter that should commit a chat input: no IME, repeats or modifiers. */
export function isCommitEnter(event: KeyboardEvent) {
  return event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && !event.repeat && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export type InputFrameProps = {
  /** Left header caption, or navigation such as batch step buttons. */
  label: ReactNode;
  /** Right header caption. */
  hint?: ReactNode;
  /** Extra header controls after the minimize button (e.g. cancel). */
  headerExtra?: ReactNode;
  title: ReactNode;
  /** Plain-text title shown clamped when minimized; defaults to title. */
  compactTitle?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
  message?: ReactNode;
  children?: ReactNode;
  /** Footer caption on the left. */
  note?: ReactNode;
  /** Footer buttons on the right. */
  actions?: ReactNode;
  /** Footer buttons on the left (e.g. batch "Отменить всё", "Назад"). */
  leadingActions?: ReactNode;
  error?: ReactNode;
  busy?: boolean;
  /** Controlled collapse. Without onMinimize the frame keeps its own state. */
  minimized?: boolean;
  onMinimize?: () => void;
  /** Allow collapsing to the title. @default true */
  minimizable?: boolean;
  /** Accusative noun for collapse labels: "вопрос", "вопросы", "форму". @default "форму" */
  noun?: string;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  /** When set the card is a form. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

/** The one native chat-input frame: header, title, scrolling body, error and footer, with collapse. Built-in kinds, batch and plugin InputCard all render through it. */
export function InputFrame({ label, hint, headerExtra, title, compactTitle, titleRef, message, children, note, actions, leadingActions, error, busy = false, minimized: controlled, onMinimize, minimizable = true, noun = 'форму', className = '', bodyClassName = '', ariaLabel, onKeyDown, onSubmit }: InputFrameProps) {
  const titleId = useId();
  const [own, setOwn] = useState(false);
  const minimized = controlled ?? own;
  const toggle = onMinimize ?? (() => setOwn(value => !value));
  const canMinimize = minimizable && (controlled === undefined || !!onMinimize);
  const content = <>
    {minimized && canMinimize && <button type="button" className="question-expand-strip" aria-label={`Развернуть ${noun}`} aria-expanded={false} onClick={toggle}><ChevronDown size={16} aria-hidden="true" /></button>}
    <header className="question-header"><span>{label}</span>{hint !== undefined && <span>{hint}</span>}{!minimized && canMinimize && <button type="button" className="question-minimize" aria-label={`Свернуть ${noun}`} aria-expanded={true} onClick={toggle}><ChevronUp size={16} /></button>}{!minimized && headerExtra}</header>
    <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{minimized ? <span className="question-copy-clamped">{compactTitle ?? title}</span> : title}</h2>
    <div className={`question-body ${bodyClassName}`.trim()} hidden={minimized}>
      {message && <p className="question-message">{message}</p>}
      {children}
    </div>
    {!minimized && error && <p className="question-error" role="alert">{error}</p>}
    {(note !== undefined || actions || leadingActions) && <footer className="question-footer" hidden={minimized}>{leadingActions && <span className="question-footer-leading">{leadingActions}</span>}<span aria-live="polite">{note}</span>{actions && <span className="confirm-actions">{actions}</span>}</footer>}
  </>;
  const classes = `question-card ${className}${minimized ? ' is-minimized' : ''}`.replace(/\s+/g, ' ').trim();
  const a11y = ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': titleId };
  return <div className="question-frame">{onSubmit
    ? <form className={classes} {...a11y} aria-busy={busy} onKeyDown={onKeyDown} onSubmit={event => { event.preventDefault(); onSubmit(event); }}>{content}</form>
    : <section className={classes} {...a11y} aria-busy={busy} onKeyDown={onKeyDown}>{content}</section>}</div>;
}
