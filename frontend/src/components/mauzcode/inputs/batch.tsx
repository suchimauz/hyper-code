import { useState, type ReactNode } from 'react';
import type { BatchDraft, BatchItem } from '../../../lib/batches';
import { ChoiceBody, choiceFromBatch, choiceSpecOptions, choiceToBatch } from './choice';
import { ConfirmActions, ConfirmBody, type ConfirmDecision, type ConfirmSpec } from './confirm';
import { GridBody, gridFromBatchSpec, gridNote, gridPicks, toggleGridPick } from './grid';

export type NativeBatchProps = { item: BatchItem; draft: BatchDraft; onChange: (draft: BatchDraft) => void; busy: boolean };
/** How a native kind takes part in a batch step: its own body and hint, optional decision actions. Submit is always the batch's. */
export type NativeBatchKind = {
  hint: (spec: Record<string, unknown>) => string;
  Body: (props: NativeBatchProps) => ReactNode;
  /** Decision buttons that only record the draft (never complete), rendered beside the batch navigation. */
  Actions?: (props: NativeBatchProps) => ReactNode;
  note?: (draft: BatchDraft) => string | undefined;
};

function ChoiceStep({ item, draft, onChange, busy }: NativeBatchProps) {
  return <ChoiceBody name={item.key} options={choiceSpecOptions(item.spec)} multiple={!!item.spec.multiple} allowOther={!!item.spec.allowOther} draft={choiceFromBatch(draft)} onChange={next => onChange(choiceToBatch(next))} disabled={busy} />;
}

function GridStep({ item, draft, onChange, busy }: NativeBatchProps) {
  const [query, setQuery] = useState('');
  const { columns, rows, multiple } = gridFromBatchSpec(item.spec);
  const values = gridPicks(draft);
  const picked = rows.filter(row => values.includes(row.value));
  const needle = query.toLocaleLowerCase();
  const visible = needle ? rows.filter(row => row.cells.some(text => text.toLocaleLowerCase().includes(needle))) : rows;
  return <GridBody name={item.key} columns={columns} rows={visible} picked={picked} multiple={multiple} query={query} onQuery={setQuery} disabled={busy}
    onToggle={row => onChange({ pick: toggleGridPick(picked, row, multiple).map(entry => entry.value) })} />;
}

const decision = (draft: BatchDraft): ConfirmDecision | null => draft.decision === 'yes' || draft.decision === 'no' ? draft.decision : null;

/** Built-in kinds reuse the same bodies and decision buttons as their standalone forms. Secret is handled by the batch host (isolated field). */
export const nativeBatchKinds: Record<string, NativeBatchKind> = {
  choice: { hint: spec => spec.multiple ? 'Можно выбрать несколько' : 'Выберите один вариант', Body: ChoiceStep },
  grid: { hint: spec => spec.multiple ? 'Можно выбрать несколько' : 'Одна строка', Body: GridStep, note: draft => gridNote(gridPicks(draft).length) },
  confirm: {
    hint: spec => spec.danger ? 'Необратимое действие' : 'Да или нет',
    Body: ({ item, draft, onChange, busy }) => <ConfirmBody details={typeof item.spec.details === 'string' ? item.spec.details : ''} comment={String(draft.comment || '')} disabled={busy} onComment={comment => onChange({ ...draft, comment })} />,
    Actions: ({ item, draft, onChange, busy }) => <ConfirmActions spec={item.spec as ConfirmSpec} disabled={busy} selected={decision(draft)} onDecide={value => onChange({ ...draft, decision: value })} />,
    note: draft => decision(draft) ? undefined : 'Выберите ответ',
  },
};

/** Collection-only native step: body plus decision actions, no endpoint calls or completion. */
export function BatchFields(props: NativeBatchProps) {
  const kind = nativeBatchKinds[props.item.kind];
  if (!kind) return null;
  return <><kind.Body {...props} />{kind.Actions && <kind.Actions {...props} />}</>;
}
