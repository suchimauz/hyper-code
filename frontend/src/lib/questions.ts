import { requestJson } from './mauzcode';
export type ChoiceOption = { value: string; label?: string; description?: string };
export type ChoiceInput = { batchId?: string; id: string; agentId: string; kind: 'choice'; title: string; message?: string; createdAt?: string; updatedAt?: string; result?: { value?: string; values?: string[]; other?: string } | null; state: 'open' | 'processing' | 'submitted' | 'cancelled'; spec: { options: (string | ChoiceOption)[]; multiple?: boolean; allowOther?: boolean } };
export type ChoiceDraft = { values: string[]; otherSelected: boolean; other: string };
export type ChoiceAnswer = { value?: string; values?: string[]; otherSelected: boolean; other?: string };
const drafts = new Map<string, ChoiceDraft>();
export const emptyChoiceDraft = (): ChoiceDraft => ({ values: [], otherSelected: false, other: '' });
export const choiceDraftKey = (agentId: string, inputId: string) => JSON.stringify([agentId, inputId]);
export function readChoiceDraft(agentId: string, inputId: string): ChoiceDraft { return drafts.get(choiceDraftKey(agentId, inputId)) || emptyChoiceDraft(); }
export function saveChoiceDraft(agentId: string, inputId: string, draft: ChoiceDraft) { drafts.set(choiceDraftKey(agentId, inputId), draft); }
export function clearChoiceDraft(agentId: string, inputId: string) { drafts.delete(choiceDraftKey(agentId, inputId)); }
export function choiceOptions(input: ChoiceInput): ChoiceOption[] { return input.spec.options.map(option => typeof option === 'string' ? { value: option, label: option } : option); }
export function choiceAnswer(input: ChoiceInput, draft: ChoiceDraft): ChoiceAnswer {
  const options = new Set(choiceOptions(input).map(option => option.value));
  const values = draft.values.filter(value => options.has(value));
  const otherSelected = !!input.spec.allowOther && draft.otherSelected;
  if (otherSelected && !draft.other.trim()) throw new Error('Напишите свой вариант ответа.');
  if (!otherSelected && !values.length) throw new Error('Выберите вариант ответа.');
  return { ...(input.spec.multiple ? { values } : !otherSelected ? { value: values[0] } : {}), otherSelected, ...(otherSelected ? { other: draft.other.trim() } : {}) };
}
export type ChoiceInputsState = { inputs: ChoiceInput[]; csrfToken: string; batch?: { revision: string; inputIds: string[] } | null };
const acceptedDrafts = new Map<string, Record<string, ChoiceAnswer>>();
export function readChoiceAnswers(agentId: string) { return acceptedDrafts.get(agentId) || {}; }
export function saveChoiceAnswers(agentId: string, answers: Record<string, ChoiceAnswer>) { acceptedDrafts.set(agentId, answers); }
export function getChoiceInputs(agentId: string, signal?: AbortSignal) { return requestJson<ChoiceInputsState>(`/ui-lab-api/choices?agentId=${encodeURIComponent(agentId)}`, { signal }); }
export function submitChoiceInput(agentId: string, inputId: string, answer: ChoiceAnswer | { cancel: true }, csrfToken: string) {
  return requestJson(`/ui-lab-api/choices?agentId=${encodeURIComponent(agentId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ id: inputId, ...answer }) });
}

/** Reconstruct only the currently overlapping choice episode; no timestamp proximity guesses. */
export function choiceEpisode(inputs: ChoiceInput[], retained: string[] = []): ChoiceInput[] {
  const pending = inputs.filter(item => item.state === 'open' || item.state === 'processing');
  if (!pending.length) return [];
  const ids = new Set([...retained, ...pending.map(item => item.id)]);
  let start = Math.min(...pending.map(item => Date.parse(item.createdAt || '')).filter(Number.isFinite));
  // Closed questions belong only when their lifetime overlaps this episode.
  for (let changed = true; changed;) {
    changed = false;
    for (const item of inputs) {
      const created = Date.parse(item.createdAt || ''), ended = Date.parse(item.updatedAt || '');
      if (!ids.has(item.id) && Number.isFinite(created) && Number.isFinite(ended) && ended >= start) {
        ids.add(item.id); start = Math.min(start, created); changed = true;
      }
    }
  }
  return inputs.filter(item => ids.has(item.id));
}
export function submitChoiceBatch(agentId: string, revision: string, answers: ({ id: string } & ChoiceAnswer)[], csrfToken: string) {
  return requestJson(`/ui-lab-api/choices?agentId=${encodeURIComponent(agentId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ revision, answers }) });
}
