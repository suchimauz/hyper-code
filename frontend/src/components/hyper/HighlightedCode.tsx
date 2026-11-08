import { useEffect, useRef, useState } from 'react';
import type { ThemedToken } from 'shiki/core';
import { codeLanguage } from '../../lib/codeLanguage';
import './code-block.css';

/** Highlight only visible code; changing/streaming text never displays stale tokens. */
export function HighlightedCode({ text, language, path, numbered = false, start = 1, lineNumbers, prefix = '' }: { text: string; language?: string; path?: string; numbered?: boolean; start?: number; lineNumbers?: string[]; prefix?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ text: string; language: string; tokens: ThemedToken[][] } | null>(null);
  const resolved = codeLanguage(language, path, text);
  useEffect(() => {
    if (!ref.current || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || resolved === 'text') return;
    let current = true;
    const timer = setTimeout(() => {
      void import('../../lib/highlightCode').then(module => module.highlightCode(text, resolved)).then(tokens => {
        if (current && tokens) setResult({ text, language: resolved, tokens });
      }).catch(() => { /* A failed/unsupported grammar must leave readable plain code. */ });
    }, 50);
    return () => { current = false; clearTimeout(timer); };
  }, [text, resolved, visible]);
  const tokens = result?.text === text && result.language === resolved ? result.tokens : null;
  const lines = text.split('\n');
  return <code ref={ref} className="syntax-code" data-language={resolved} data-highlighted={!!tokens}>
    {lines.map((line, index) => <span className="syntax-line" key={index}>{(numbered || lineNumbers) && <span className="syntax-gutter" aria-hidden="true">{lineNumbers?.[index] ?? start + index}</span>}{prefix && <span className="syntax-prefix" aria-hidden="true">{prefix}</span>}<span className="syntax-line-content">{tokens?.[index]?.map((token, i) => <span key={i} style={{ color: token.color, fontStyle: (token.fontStyle ?? 0) & 1 ? 'italic' : undefined, fontWeight: (token.fontStyle ?? 0) & 2 ? 700 : undefined, textDecoration: (token.fontStyle ?? 0) & 4 ? 'underline' : undefined }}>{token.content}</span>) ?? line}{index < lines.length - 1 ? '\n' : ''}</span></span>)}
  </code>;
}
