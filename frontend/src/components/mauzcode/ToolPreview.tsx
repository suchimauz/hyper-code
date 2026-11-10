import { useState } from 'react';
import { HighlightedCode } from './HighlightedCode';
import { CodeBlock } from './CodeBlock';
import { codeLanguage } from '../../lib/codeLanguage';

/** Preserve server line/hash anchors as a gutter, not as part of a file's grammar. */
export function readCodeLines(text: string): { text: string; lineNumbers?: string[] } {
  const lines = text.split('\n');
  const parsed = lines.map(line => line.match(/^(\d+[a-z0-9]*)\|(.*)$/) || line.match(/^\s*(\d+)[→\t](.*)$/));
  if (!parsed.some(Boolean) || parsed.some((match, i) => !match && lines[i].trim())) return { text };
  return { text: parsed.map((match, i) => match ? match[2] : lines[i]).join('\n'), lineNumbers: parsed.map(match => match?.[1] || '') };
}
/** Compact tool code retains the shared tool background, diff tones and expand control. */
export function ToolPreview({ text, limit = 8, numbered = false, start = 1, tone = '', language, path, read = false, prefix = '' }: { text: string; limit?: number; numbered?: boolean; start?: number; tone?: string; language?: string; path?: string; read?: boolean; prefix?: string }) {
  const [all, setAll] = useState(false);
  const source = read ? readCodeLines(text) : { text };
  const lines = source.text.split('\n');
  const shown = all ? lines : lines.slice(0, limit);
  const resolved = codeLanguage(language, path, source.text);
  return <>{resolved !== 'text' ? <CodeBlock compact text={source.text} displayText={shown.join('\n')} language={resolved} numbered={numbered} start={start} lineNumbers={source.lineNumbers?.slice(0, shown.length)} prefix={prefix} tone={tone} /> : <pre className={`tool-preview ${tone}`}><HighlightedCode text={shown.join('\n')} language={resolved} numbered={numbered} start={start} lineNumbers={source.lineNumbers?.slice(0, shown.length)} prefix={prefix} /></pre>}{lines.length > limit && <button className="tool-preview-more" type="button" onClick={() => setAll(value => !value)}>{all ? 'Свернуть' : `Показать все ${lines.length} строк`}</button>}</>;
}
