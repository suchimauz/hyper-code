import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { effortLabel, modelGroup, getDraftModelSettings, getModelSettings, setAgentEffort, setAgentModel, type ModelSettings } from '../../lib/models';
import { rememberSessionSelection } from '../../lib/newSession';
import './model-picker.css';

type Page = 'main' | 'models' | 'effort';
export type ModelPickerDraft = { model: string; effort: string; onChange: (model: string, effort: string) => void };
export function ModelPicker({ agentId = '', running = false, busy = false, revision = 0, onSaved, onBusyChange, onReadyChange, draft }: { agentId?: string; running?: boolean; busy?: boolean; revision?: number; onSaved?: () => void; onBusyChange?: (busy: boolean) => void; onReadyChange?: (ready: boolean) => void; draft?: ModelPickerDraft }) {
  const [settings, setData] = useState<ModelSettings | null>(null);
  const isDraft = !!draft;
  const draftModel = draft?.model ?? '';
  const draftEffort = draft?.effort ?? 'auto';
  const selected = settings?.models.find(option => option.model === draftModel);
  // Keep the controlled selection visible while read-only capability metadata refreshes.
  const data = settings && draft ? { ...settings, model: draftModel || settings.model, label: selected?.label ?? (draftModel || settings.label), icon: selected?.icon ?? settings.icon,
    effort: { ...settings.effort, requested: draftEffort } } : settings;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>('main');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const popup = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  const draftChange = useRef(draft?.onChange); draftChange.current = draft?.onChange;
  const readyChange = useRef(onReadyChange); readyChange.current = onReadyChange;
  useEffect(() => {
    readyChange.current?.(!loading && !error && !!settings && (!isDraft || (settings.model === draftModel && settings.effort.requested === draftEffort)));
  }, [loading, error, settings, isDraft, draftModel, draftEffort]);
  useEffect(() => {
    const controller = new AbortController(); const current = ++generation.current;
    setLoading(true);
    void (isDraft ? getDraftModelSettings(draftModel, draftEffort, controller.signal) : getModelSettings(agentId, controller.signal)).then(value => {
      if (!controller.signal.aborted && generation.current === current) {
        setData(value); setError('');
        if (isDraft && (draftModel !== value.model || draftEffort !== value.effort.requested)) draftChange.current?.(value.model, value.effort.requested);
      }
    }).catch(err => { if (!controller.signal.aborted && generation.current === current) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [agentId, running, revision, retry, isDraft, draftModel, draftEffort]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => (popup.current?.querySelector<HTMLElement>(page === 'models' ? 'input' : '[role^="menuitem"]') ?? popup.current?.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus());
    return () => cancelAnimationFrame(frame);
  }, [page, open, loading]);
  const changeOpen = (value: boolean) => { setOpen(value); if (value) { setPage('main'); setQuery(''); setRetry(n => n + 1); } };
  const choose = async (kind: 'model' | 'effort', value: string) => {
    if (lock.current || busy || running || loading) return;
    if (kind === 'effort' && !data?.effort.supported.includes(value)) return;
    if (kind === 'model' && !data?.models.some(option => option.model === value && !option.disabled)) return;
    if ((kind === 'model' ? data?.model : data?.effort.requested) === value) { setOpen(false); return; }
    if (draft) {
      draft.onChange(kind === 'model' ? value : (draft.model || data?.model || ''), kind === 'effort' ? value : draft.effort);
      if (kind === 'model') rememberSessionSelection({ model: value });
      setError(''); setOpen(false);
      return;
    }
    if (!agentId) return;
    lock.current = true; setLoading(false); setSaving(true); onBusyChange?.(true); setError('');
    const current = ++generation.current;
    try {
      if (kind === 'model') { await setAgentModel(agentId, value); rememberSessionSelection({ model: value }); } else await setAgentEffort(agentId, value);
      if (generation.current !== current) return;
      // Read back native normalization (including provider-specific effort downgrade).
      let updated = await getModelSettings(agentId);
      if (kind === 'model' && updated.effort.requested !== 'auto' && !updated.effort.supported.includes(updated.effort.requested)) {
        await setAgentEffort(agentId, 'auto');
        updated = await getModelSettings(agentId);
      }
      if (generation.current === current) { setData(updated); setOpen(false); onSaved?.(); }
    } catch (err) { if (generation.current === current) setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setSaving(false); onBusyChange?.(false); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if (event.target instanceof HTMLInputElement && ['Home','End'].includes(event.key)) return;
    const items = [...(popup.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return;
    event.preventDefault(); const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  const groups = new Map<string, ModelSettings['models']>();
  for (const option of data?.models ?? []) {
    if (!`${option.label} ${option.provider} ${option.model}`.toLowerCase().includes(query.trim().toLowerCase())) continue;
    const key = modelGroup(option); const group = groups.get(key) ?? []; group.push(option); groups.set(key, group);
  }
  const effort = data?.effort;
  const hasEffort = !!effort && effort.mode !== 'none' && effort.supported.length > 0;
  const label = data?.label || data?.model || 'Model';
  return <Popover.Root open={open} onOpenChange={(value, details) => {
    if (!value && details.reason === 'escape-key' && page !== 'main') { details.cancel(); setPage('main'); setQuery(''); return; }
    changeOpen(value);
  }}>
    <Popover.Trigger render={<button type="button" className="model-picker-trigger" title={data?.model || 'Выбрать модель'} aria-label={`Выбрать модель: ${label}`} disabled={saving || busy} />}>
      {data?.icon ? <NavigationChatIcon icon={data.icon} /> : <Cpu size={14} strokeWidth={1} />}
      <span className="model-picker-label">{label}</span>{hasEffort && <span className="model-picker-effort">{effortLabel(effort.requested === 'auto' ? 'auto' : effort.applied)}</span>}<ChevronDown size={14} strokeWidth={1} className="model-picker-chevron" />
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner">
      <Popover.Popup ref={popup} className="model-picker-menu" aria-label="Model and effort" aria-busy={saving || loading} onKeyDown={keyboard}>
        {loading && !data ? <p className="model-picker-note" role="status">Загрузка моделей…</p> : <>
          {page === 'main' && <div role="menu" aria-label="Настройки модели">
            <button type="button" role="menuitem" className="model-picker-cell" disabled={!data || saving} onClick={() => setPage('models')}><span>Model</span><span className="model-picker-cell-value">{label}</span><ChevronRight size={14} strokeWidth={1} /></button>
            {hasEffort && <button type="button" role="menuitem" className="model-picker-cell" disabled={saving} onClick={() => setPage('effort')}><span>Effort</span><span className="model-picker-cell-value">{effortLabel(effort.requested)}</span><ChevronRight size={14} strokeWidth={1} /></button>}
          </div>}
          {page === 'models' && <>{(data?.models.length ?? 0) > 4 && <input className="model-picker-search" aria-label="Search models" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} />}
            <div role="menu" aria-label="Model" className="model-picker-scroll">{[...groups].map(([provider, options]) => <section role="group" aria-label={provider} key={provider}>
              <div className="model-picker-group">{provider}</div>{options.map(option => <button type="button" key={option.model} role="menuitemradio" aria-checked={option.model === data?.model} className="model-picker-option" title={option.disabled ? `${option.model} — недоступна по политике провайдера` : option.model} disabled={option.disabled || saving || running || busy} onClick={() => void choose('model', option.model)}>
                <NavigationChatIcon icon={option.icon} /><span>{option.label}</span><span className="model-picker-check">{option.model === data?.model && <Check size={16} strokeWidth={1} />}</span>
              </button>)}
            </section>)}{!groups.size && <p className="model-picker-note">Модели не найдены</p>}</div></>}
          {page === 'effort' && <div role="menu" aria-label="Effort">{[...new Set(['auto', ...(effort?.supported ?? [])])].map(value => <button type="button" role="menuitemradio" key={value} aria-checked={value === effort?.requested} className="model-picker-option" disabled={saving || running || busy} onClick={() => void choose('effort', value)}><span>{effortLabel(value)}</span><span className="model-picker-check">{value === effort?.requested && <Check size={16} strokeWidth={1} />}</span></button>)}</div>}
        </>}
        {running && <p className="model-picker-note">Смена доступна после завершения ответа.</p>}
        {saving && <p className="model-picker-note" role="status">Сохранение…</p>}
        {error && <div className="model-picker-error" role="alert">{error}<button type="button" disabled={saving} onClick={() => setRetry(n => n + 1)}>Повторить загрузку</button></div>}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
