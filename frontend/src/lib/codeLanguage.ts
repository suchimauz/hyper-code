/** Resolve explicit fence labels and file extensions; never guess a language from prose. */
export function codeLanguage(language = '', path = '', text = ''): string {
  const aliases: Record<string, string> = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', shell: 'shellscript', py: 'python', rb: 'ruby', rs: 'rust', yml: 'yaml', md: 'markdown', htm: 'html', vue: 'vue', cs: 'csharp', cpp: 'cpp', h: 'c', dockerfile: 'dockerfile', jsonc: 'jsonc', text: 'text', txt: 'text', plaintext: 'text' };
  const explicit = language.trim().split(/\s+/)[0].toLowerCase();
  if (explicit) return aliases[explicit] || explicit;
  const file = path.split(/[\\/]/).pop()?.toLowerCase() || '';
  const ext = file.includes('.') ? file.split('.').pop()! : file;
  if (ext) return aliases[ext] || ext;
  if (/^\s*[\[{]/.test(text)) {
    try { JSON.parse(text); return 'json'; } catch { /* Bun/REPL object inspection is JavaScript, not JSON. */ }
    if (/^\s*\{\s*(?:[A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:/.test(text)) return 'javascript';
  }
  return 'text';
}
