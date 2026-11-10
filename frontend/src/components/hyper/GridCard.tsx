import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { readGridPicks, saveGridPicks, searchGrid, type GridInput, type GridRow } from '../../lib/grids';
import '../../styles/scrollbar.css';
import '../../styles/questions.css';

/** Native Hyper grid input: pick one or several table rows with a server-side live filter. */
export function GridCard({ input, busy = false, error = '', onSubmit, onCancel, minimized = false, onMinimize }: { input: GridInput; busy?: boolean; error?: string; minimized?: boolean; onMinimize?: () => void; onSubmit: (values: string[]) => void; onCancel: () => void }) {
  const titleId = useId();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<GridRow[]>([]);
  const [page, setPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState<GridRow[]>(() => readGridPicks(input.agentId, input.id));
  const generation = useRef(0);
  const multiple = input.spec.multiple;
  const locked = busy || input.state !== 'open';
  useEffect(() => {
    const controller = new AbortController();
    const attempt = ++generation.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchGrid(input.agentId, input.id, q, controller.signal)
        .then(out => { if (attempt === generation.current) { setRows(out.rows); setPage(out.page); setLoadError(''); } })
        .catch(reason => { if (!controller.signal.aborted && attempt === generation.current) setLoadError(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { if (attempt === generation.current) setLoading(false); });
    }, q ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [input.agentId, input.id, q]);
  const pickedValues = new Set(picked.map(row => row.value));
  const toggle = (row: GridRow) => {
    if (locked) return;
    const next = multiple ? (pickedValues.has(row.value) ? picked.filter(item => item.value !== row.value) : [...picked, row]) : [row];
    setPicked(next); saveGridPicks(input.agentId, input.id, next);
  };
  // Picked rows stay visible (and submitted) even when the filter hides them.
  const seen = new Set(rows.map(row => row.value));
  const shown = [...picked.filter(row => !seen.has(row.value)), ...rows];
  const send = () => { if (!locked && picked.length) onSubmit(picked.map(row => row.value)); };
  const columns = input.spec.columns;
  return <div className="question-frame"><section className={`question-card grid-card${minimized ? ' is-minimized' : ''}`} aria-labelledby={titleId} aria-busy={busy}>
    {minimized && onMinimize && <button type="button" className="question-expand-strip" aria-label="Развернуть вопрос" aria-expanded={false} onClick={onMinimize}><ChevronDown size={16} aria-hidden="true"/></button>}
    <header className="question-header"><span>Выбор из таблицы</span><span>{multiple ? 'Можно выбрать несколько' : 'Одна строка'}</span>{!minimized && onMinimize && <button type="button" className="question-minimize" aria-label="Свернуть вопрос" aria-expanded={true} onClick={onMinimize}><ChevronUp size={16}/></button>}</header>
    <h2 id={titleId}>{minimized ? <span className="question-copy-clamped">{input.title}</span> : input.title}</h2>
    <div className="question-body" hidden={minimized}>
      {input.message && <p className="question-message">{input.message}</p>}
      <label className="grid-filter"><Search size={14} aria-hidden="true"/><input type="search" aria-label="Фильтр строк" placeholder="Фильтр…" autoComplete="off" value={q} disabled={locked}
        onChange={event => setQ(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} /></label>
      <div className="grid-table-wrap scrollbar-thin" aria-busy={loading}>
        <table className="grid-table">
          <thead><tr><th aria-label="Выбор"/>{columns.map((column, index) => <th key={index} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>
            {shown.length ? shown.map(row => {
              const selected = pickedValues.has(row.value);
              return <tr key={row.value} className={selected ? 'is-selected' : undefined} onClick={() => toggle(row)}>
                <td className="grid-pick"><input type={multiple ? 'checkbox' : 'radio'} name={`grid-${input.id}`} aria-label={row.cells.find(Boolean) || row.value} checked={selected} disabled={locked} onChange={() => toggle(row)} onClick={event => event.stopPropagation()} /></td>
                {columns.map((_, index) => <td key={index} title={row.cells[index]}>{row.cells[index]}</td>)}
              </tr>;
            }) : <tr><td className="grid-empty" colSpan={columns.length + 1}>{loading ? 'Загружаем…' : 'Ничего не найдено'}</td></tr>}
          </tbody>
        </table>
      </div>
      {loadError ? <p className="question-error" role="alert">{loadError}</p> : rows.length >= page && <p className="grid-note">Показаны первые {page} совпадений — уточните фильтр</p>}
    </div>
    {!minimized && error && <p className="question-error" role="alert">{error}</p>}
    <footer className="question-footer" hidden={minimized}><span aria-live="polite">{input.state !== 'open' ? 'Вопрос уже закрыт' : picked.length ? `Выбрано: ${picked.length}` : 'Выберите строку'}</span><span className="confirm-actions">
      <button type="button" className="confirm-decline" disabled={locked} onClick={onCancel}>Отмена</button>
      <button type="button" className="confirm-accept" disabled={locked || !picked.length} onClick={send}>{busy ? 'Отправляем…' : 'Отправить'}</button>
    </span></footer>
  </section></div>;
}
