import { Search } from 'lucide-react';
import type { GridRow } from '../../../lib/grids';
import type { BatchDraft } from '../../../lib/batches';

export type GridBodyProps = {
  name: string;
  columns: { label: string }[];
  /** Rows matching the current filter. Picked rows stay visible even when filtered out. */
  rows: GridRow[];
  picked: GridRow[];
  onToggle: (row: GridRow) => void;
  multiple: boolean;
  query: string;
  onQuery: (query: string) => void;
  onEnter?: () => void;
  loading?: boolean;
  loadError?: string;
  /** When rows.length reaches it, a "refine the filter" note is shown. */
  page?: number;
  disabled?: boolean;
};

/** Grid content only: live filter and selectable table. Data comes from the caller (server search or inline batch rows). */
export function GridBody({ name, columns, rows, picked, onToggle, multiple, query, onQuery, onEnter, loading = false, loadError = '', page, disabled = false }: GridBodyProps) {
  const pickedValues = new Set(picked.map(row => row.value));
  const seen = new Set(rows.map(row => row.value));
  const shown = [...picked.filter(row => !seen.has(row.value)), ...rows];
  const toggle = (row: GridRow) => { if (!disabled) onToggle(row); };
  return <>
    <label className="grid-filter"><Search size={14} aria-hidden="true"/><input type="search" aria-label="Фильтр строк" placeholder="Фильтр…" autoComplete="off" value={query} disabled={disabled}
      onChange={event => onQuery(event.target.value)} onKeyDown={event => { if (onEnter && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); } }} /></label>
    <div className="grid-table-wrap scrollbar-thin" aria-busy={loading}>
      <table className="grid-table">
        <thead><tr><th aria-label="Выбор"/>{columns.map((column, index) => <th key={index} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {shown.length ? shown.map(row => {
            const selected = pickedValues.has(row.value);
            return <tr key={row.value} className={selected ? 'is-selected' : undefined} onClick={() => toggle(row)}>
              <td className="grid-pick"><input type={multiple ? 'checkbox' : 'radio'} name={name} aria-label={row.cells.find(Boolean) || row.value} checked={selected} disabled={disabled} onChange={() => toggle(row)} onClick={event => event.stopPropagation()} /></td>
              {columns.map((_, index) => <td key={index} title={row.cells[index]}>{row.cells[index]}</td>)}
            </tr>;
          }) : <tr><td className="grid-empty" colSpan={columns.length + 1}>{loading ? 'Загружаем…' : 'Ничего не найдено'}</td></tr>}
        </tbody>
      </table>
    </div>
    {loadError ? <p className="question-error" role="alert">{loadError}</p> : page !== undefined && rows.length >= page && <p className="grid-note">Показаны первые {page} совпадений — уточните фильтр</p>}
  </>;
}

/** Grid footer buttons for a standalone table pick. */
export function GridActions({ busy = false, disabled = false, count, onSubmit, onCancel }: { busy?: boolean; disabled?: boolean; count: number; onSubmit: () => void; onCancel: () => void }) {
  return <span className="confirm-actions">
    <button type="button" className="confirm-decline" disabled={disabled} onClick={onCancel}>Отмена</button>
    <button type="button" className="confirm-accept" disabled={disabled || !count} onClick={onSubmit}>{busy ? 'Отправляем…' : 'Отправить'}</button>
  </span>;
}

export const gridNote = (count: number) => count ? `Выбрано: ${count}` : 'Выберите строку';
export const toggleGridPick = (picked: GridRow[], row: GridRow, multiple: boolean) => multiple ? (picked.some(item => item.value === row.value) ? picked.filter(item => item.value !== row.value) : [...picked, row]) : [row];

const cell = (value: unknown) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
/** Normalized inline batch grid spec → body data, matching the server codec's cell formatting. */
export function gridFromBatchSpec(spec: Record<string, unknown>) {
  const columns = ((spec.columns || []) as { key: string; label?: string }[]).map(column => ({ key: column.key, label: column.label || column.key }));
  const valueKey = String(spec.valueKey || 'id');
  const rows: GridRow[] = ((spec.rows || []) as Record<string, unknown>[]).map(row => ({ value: cell(row[valueKey]), cells: columns.map(column => cell(row[column.key])) }));
  return { columns, rows, multiple: !!spec.multiple };
}
export const gridPicks = (draft: BatchDraft) => typeof draft.pick === 'string' ? [draft.pick] : draft.pick || [];
