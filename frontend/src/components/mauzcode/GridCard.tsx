import { useEffect, useId, useRef, useState } from 'react';
import { InputFrame } from './inputs/InputFrame';
import { GridActions, GridBody, gridNote, toggleGridPick } from './inputs/grid';
import { readGridPicks, saveGridPicks, searchGrid, type GridInput, type GridRow } from '../../lib/grids';

/** Native MauzCode grid form: server-side live filter feeding the shared GridBody and GridActions. */
export function GridCard({ input, busy = false, error = '', onSubmit, onCancel, minimized = false, onMinimize }: { input: GridInput; busy?: boolean; error?: string; minimized?: boolean; onMinimize?: () => void; onSubmit: (values: string[]) => void; onCancel: () => void }) {
  const name = useId();
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
  const toggle = (row: GridRow) => { const next = toggleGridPick(picked, row, multiple); setPicked(next); saveGridPicks(input.agentId, input.id, next); };
  const send = () => { if (!locked && picked.length) onSubmit(picked.map(row => row.value)); };
  return <InputFrame className="grid-card" noun="вопрос" busy={busy} minimized={minimized} onMinimize={onMinimize}
    label="Выбор из таблицы" hint={multiple ? 'Можно выбрать несколько' : 'Одна строка'} title={input.title} message={input.message} error={error}
    note={input.state !== 'open' ? 'Вопрос уже закрыт' : gridNote(picked.length)}
    actions={<GridActions busy={busy} disabled={locked} count={picked.length} onSubmit={send} onCancel={onCancel} />}>
    <GridBody name={`grid-${name}`} columns={input.spec.columns} rows={rows} picked={picked} onToggle={toggle} multiple={multiple} query={q} onQuery={setQ} onEnter={send} loading={loading} loadError={loadError} page={page} disabled={locked} />
  </InputFrame>;
}
