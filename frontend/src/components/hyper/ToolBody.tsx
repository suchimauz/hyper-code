import { ToolPreview as Preview } from './ToolPreview';
import { HighlightedCode } from './HighlightedCode';
import type { ToolDetails } from '../../lib/hyper';

function pretty(text: string) { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }
/** Adapt dsh read/search/diff/terminal presentations to the bounded Hyper payload. */
export function ToolBody({ details, kind, args }: { details: ToolDetails; kind: string; args: Record<string, unknown> }) {
  const path = typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : typeof args.file === 'string' ? args.file : '';
  const result = details.result;
  const changes = Array.isArray(args.edits) ? args.edits.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object') : [];
  const textChanges = changes.filter(change => typeof change.oldText === 'string' && typeof change.newText === 'string');
  const command = typeof args.command === 'string' ? args.command : '';
  const code = typeof args.code === 'string' ? args.code : '';
  const evaluation = ['eval', 'tools_eval', 'nrepl_eval'].includes(kind);
  const evalLanguage = details.name.startsWith('nrepl.') || kind === 'nrepl_eval' ? 'clojure' : 'typescript';
  const known = evaluation || ['read', 'grep', 'find', 'glob', 'write', 'edit', 'bash'].includes(kind);
  return <div className="tool-specialized-body" data-tool-kind={kind}>
    {path && <div className="tool-body-label">{path}</div>}
    {kind === 'bash' && <>{command && <div className="tool-terminal-command"><span aria-hidden="true">$ </span><HighlightedCode text={command} language="bash" /></div>}{result && <Preview text={result} limit={Number.POSITIVE_INFINITY} />}</>}
    {evaluation && <div className="tool-io">
      <section className="tool-io-section" aria-label="Ввод"><h4>Ввод</h4><div><Preview text={code || pretty(details.args || '{}')} limit={Number.POSITIVE_INFINITY} language={code ? evalLanguage : 'json'} /></div></section>
      <section className="tool-io-section" aria-label="Вывод" data-error={details.isError || undefined}><h4>Вывод</h4><div>{result ? <Preview text={result} limit={Number.POSITIVE_INFINITY} /> : <p>Вывод отсутствует.</p>}</div></section>
    </div>}
    {kind === 'read' && result && <Preview text={result} path={path} read />}
    {['grep', 'find', 'glob'].includes(kind) && <>{typeof args.pattern === 'string' && <div className="tool-body-label">{args.pattern}</div>}{result && <Preview text={result} />}</>}
    {kind === 'write' && <>{typeof args.content === 'string' && <Preview text={args.content} path={path} limit={9} numbered tone="tool-row-added" />}{result && <Preview text={result} />}</>}
    {kind === 'edit' && <>{textChanges.map((change, i) => <div className="tool-row-diff" key={i}><Preview text={String(change.oldText)} path={path} prefix="− " numbered limit={9} tone="tool-row-removed" /><Preview text={String(change.newText)} path={path} prefix="+ " numbered limit={9} tone="tool-row-added" /></div>)}{result && <Preview text={result} />}{changes.length > textChanges.length && <p>Для части правок нет пары «до/после»; смотрите исходные данные.</p>}</>}
    {!known && <div className="tool-io">
      <section className="tool-io-section" aria-label="Ввод"><h4>Ввод</h4><div><Preview text={pretty(details.args || '{}')} language="json" /></div></section>
      <section className="tool-io-section" aria-label="Вывод" data-error={details.isError || undefined}><h4>{details.isError ? 'Вывод · ошибка' : 'Вывод'}</h4><div>{result ? <Preview text={pretty(result)} /> : <p>Вывод отсутствует.</p>}</div></section>
    </div>}
    {kind === 'edit' && changes.filter(change => !(typeof change.oldText === 'string' && typeof change.newText === 'string')).map((change, i) => typeof change.text === 'string' ? <Preview key={i} text={change.text} path={path} numbered start={typeof change.anchor === 'string' ? (Number.parseInt(change.anchor, 10) || 1) + (change.op === 'insertAfter' && /^\d/.test(change.anchor) ? 1 : 0) : 1} tone="tool-row-added" prefix="+ " /> : null)}
    {known && !result && <p className="tool-body-note">Вывод в этом событии отсутствует.</p>}
    {details.isError && known && <span className="sr-only">Ошибка выполнения</span>}
    {details.resultTruncated && <p>Результат сокращён сервером.</p>}
    {details.argsTruncated && <p>Аргументы сокращены сервером.</p>}
    {known && details.args !== '{}' && <details className="tool-raw"><summary>Исходные аргументы</summary><Preview text={pretty(details.args)} language="json" /></details>}
  </div>;
}
