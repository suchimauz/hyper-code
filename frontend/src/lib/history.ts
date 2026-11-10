import type { ChoiceInput } from './questions';
import type { ConfirmInput } from './confirms';
import type { GridInput } from './grids';
import type { SecretHistoryInput } from './secrets';
/** Native input kinds whose answered cards stay visible as transcript history rows. */
export type HistoryInput = ChoiceInput | ConfirmInput | GridInput | SecretHistoryInput;
export const HISTORY_KINDS = ['choice', 'confirm', 'grid', 'secret'] as const;
export const isHistoryKind = (kind: unknown): kind is HistoryInput['kind'] => (HISTORY_KINDS as readonly unknown[]).includes(kind);
