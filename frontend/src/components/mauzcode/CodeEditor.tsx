import { useEffect, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** Lazily loaded language support by file extension; unknown extensions stay plain text. */
async function languageFor(path: string): Promise<Extension> {
  const ext = path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
  if (/^(m?[jt]sx?|c[jt]s)$/.test(ext)) { const { javascript } = await import('@codemirror/lang-javascript'); return javascript({ typescript: /ts/.test(ext), jsx: /x$/.test(ext) }); }
  if (ext === 'json' || ext === 'jsonc') { const { json } = await import('@codemirror/lang-json'); return json(); }
  if (/^(css|scss|less)$/.test(ext)) { const { css } = await import('@codemirror/lang-css'); return css(); }
  if (/^(html?|svg|xml|vue)$/.test(ext)) { const { html } = await import('@codemirror/lang-html'); return html(); }
  if (/^(md|markdown|mdx)$/.test(ext)) { const { markdown } = await import('@codemirror/lang-markdown'); return markdown(); }
  if (ext === 'sql') { const { sql } = await import('@codemirror/lang-sql'); return sql(); }
  return [];
}

const darkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#ff7ab2' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#fc6a5d' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#d0bf69' },
  { tag: [tags.comment, tags.meta], color: '#7f8c98', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#5dd8ff' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#67b7a4' },
  { tag: [tags.propertyName, tags.attributeName], color: '#a167e6' },
  { tag: [tags.tagName], color: '#ff7ab2' },
  { tag: [tags.heading], color: '#fdfdfd', fontWeight: '600' },
  { tag: [tags.link, tags.url], color: '#6699ff', textDecoration: 'underline' },
]);

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.6' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-caption)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '28px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft) !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--surface-raised)', color: 'var(--text)', borderColor: 'var(--line)' },
  '.cm-foldGutter span': { color: 'var(--text-caption)' },
});

/**
 * CodeMirror 6 editor for the Canvas file viewer: line numbers, folding, search, syntax colours by extension.
 * The document is replaced only when `docKey` changes, so typing never round-trips through React state.
 */
export function CodeEditor({ docKey, path, value, theme, readOnly, wrap, onChange, onSave }: {
  docKey: string; path: string; value: string; theme: 'light' | 'dark'; readOnly?: boolean; wrap?: boolean;
  onChange: (value: string) => void; onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const language = useRef(new Compartment());
  const look = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const wrapping = useRef(new Compartment());
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(),
        indentOnInput(), bracketMatching(), highlightActiveLine(), highlightSelectionMatches(),
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { callbacks.current.onSave(); return true; } }, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
        baseTheme,
        look.current.of(syntaxHighlighting(theme === 'dark' ? darkHighlight : defaultHighlightStyle, { fallback: true })),
        language.current.of([]),
        editable.current.of(EditorState.readOnly.of(!!readOnly)),
        wrapping.current.of(wrap ? EditorView.lineWrapping : []),
        EditorView.contentAttributes.of({ 'aria-label': `Текст файла ${path}` }),
        EditorView.updateListener.of(update => { if (update.docChanged) callbacks.current.onChange(update.state.doc.toString()); }),
      ],
    });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    let alive = true;
    void languageFor(path).then(ext => { if (alive) editor.dispatch({ effects: language.current.reconfigure(ext) }); });
    return () => { alive = false; editor.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);
  useEffect(() => { view.current?.dispatch({ effects: look.current.reconfigure(syntaxHighlighting(theme === 'dark' ? darkHighlight : defaultHighlightStyle, { fallback: true })) }); }, [theme]);
  useEffect(() => { view.current?.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(!!readOnly)) }); }, [readOnly]);
  useEffect(() => { view.current?.dispatch({ effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);
  return <div ref={host} className="canvas-code" />;
}
