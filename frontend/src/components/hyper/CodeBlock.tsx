import { useEffect, useRef, useState } from 'react';
import { Check, Copy, WrapText } from 'lucide-react';
import { HighlightedCode } from './HighlightedCode';
import './code-block.css';

/** Measured dsh Claude code card: language, wrap toggle, copy, and uncapped code body. */
export function CodeBlock({ text, language = '', title, numbered = false, displayText = text, lineNumbers, start = 1, prefix = '', compact = false, tone = '' }: { text: string; language?: string; title?: string; numbered?: boolean; displayText?: string; lineNumbers?: string[]; start?: number; prefix?: string; compact?: boolean; tone?: string }) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setError(false); clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
    } catch { setError(true); }
  };
  return <div className={`code-block ${compact ? 'code-block--tool' : ''}`} data-code-wrap={wrap}>
    <div className="code-block-banner" data-code-block-banner>
      <div className="code-block-heading"><span className="code-block-language">{language || 'Code block'}</span>{title && <span className="code-block-title" title={title}>{title}</span>}</div>
      <div className="code-block-actions">
        <button type="button" aria-label="Перенос строк" title="Перенос строк" aria-pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText size={14} strokeWidth={1} /></button>
        <button type="button" aria-label={copied ? 'Скопировано' : 'Копировать код'} title={copied ? 'Скопировано' : 'Копировать код'} onClick={() => { void copy(); }}>{copied ? <Check size={14} strokeWidth={1} /> : <Copy size={14} strokeWidth={1} />}</button>
      </div>
    </div>
    <pre className={compact ? `tool-preview ${tone}` : undefined}><HighlightedCode text={displayText} language={language} numbered={numbered} lineNumbers={lineNumbers} start={start} prefix={prefix} /></pre>
    {error && <span className="code-copy-error" role="status">Не удалось скопировать код</span>}
  </div>;
}
