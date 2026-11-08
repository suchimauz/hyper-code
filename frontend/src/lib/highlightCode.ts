import { createCssVariablesTheme, createHighlighterCore, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

const theme = createCssVariablesTheme({ name: 'hyper-code', variablePrefix: '--syntax-', fontStyle: true });
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
const loading = new Map<string, Promise<void>>();
const cache = new Map<string, ThemedToken[][]>();
/** Lazy TextMate grammars, bounded tokenization and React-safe tokens (never arbitrary HTML). */
export async function highlightCode(text: string, language: string): Promise<ThemedToken[][] | null> {
  if (text.length > 100_000 || !Object.hasOwn(bundledLanguages, language)) return null;
  const key = `${language}\0${text}`;
  const cached = cache.get(key); if (cached) return cached;
  highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
  const engine = await highlighter;
  if (!engine.getLoadedLanguages().includes(language)) {
    let pending = loading.get(language);
    if (!pending) {
      pending = engine.loadLanguage(bundledLanguages[language as keyof typeof bundledLanguages]).finally(() => loading.delete(language));
      loading.set(language, pending);
    }
    await pending;
  }
  const tokens = engine.codeToTokensBase(text, { lang: language, theme: 'hyper-code', tokenizeMaxLineLength: 1000 });
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, tokens);
  return tokens;
}
