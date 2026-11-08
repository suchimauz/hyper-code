import { useEffect, useId, useState, type ReactNode } from 'react';
import { ComposerAddButton } from './ComposerAddButton';
import { HoverPanel } from '../ui/HoverPanel';
import { ContextDetailsPanel } from './ContextDetailsPanel';
import { ContextPie } from './ContextPie';
import { ModelPicker } from './ModelPicker';
import { RollingNumber } from '../ui/RollingNumber';
import { getContextBudget, type ContextBudget, type ContextDetails } from '../../lib/hyper';
import './composer-footer.css';
export function ComposerFooter({ agentId, running, busy, revision, onMenuToggle, menuOpen, onModelSaved, onModelBusy, planningBadge }: { planningBadge?: ReactNode; onModelSaved?: () => void; onModelBusy?: (busy: boolean) => void; menuOpen?: boolean; agentId: string; running: boolean; busy: boolean; revision: number; onMenuToggle: () => void }) {
  const [contextOpen, setContextOpen] = useState(false);
  const contextId = useId();
  const [details, setDetails] = useState<ContextDetails | null>(null);
  const [budget, setBudget] = useState<ContextBudget | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try { const result = await getContextBudget(agentId, controller.signal); if (!controller.signal.aborted) { setBudget(result.budget); setDetails(result.details ?? null); } }
      catch { if (!controller.signal.aborted) { setBudget(null); setDetails(null); } }
      finally { pending = false; }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [agentId, running, revision]);
  const percent = budget && budget.contextWindow && budget.contextWindow > 0 ? Math.round(budget.estimatedTokens / budget.contextWindow * 100) : null;
  const label = percent == null ? 'Оценка контекста недоступна' : `${percent}% of context used`;
  const detail = budget ? `${budget.estimatedTokens.toLocaleString('ru-RU')} токенов${budget.contextWindow ? ` из ${budget.contextWindow.toLocaleString('ru-RU')}` : '; размер окна неизвестен'}. Оценка следующего запроса.` : 'Не удалось получить оценку следующего запроса.';
  const usage = details?.usage;
  // Input already includes cache reads and writes; adding them again double-counts usage.
  const formatTokens = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString('en-US');
  const cache = usage?.cacheHitRatio == null ? null : Math.round(usage.cacheHitRatio * 100);
  const formatUsd = (n: number | null | undefined) => n == null ? '$—' : n > 0 && n < 0.01 ? '<$0.01' : `$${n.toLocaleString('en-US', n < 10 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
  const costLabel = usage?.costUsd == null ? 'Цена неизвестна' : `Примерная цена по API-прайсу ${formatUsd(usage.costUsd)}`;
  const usageLabel = `Input: ${formatTokens(usage?.inputTokens)} tok. Output: ${formatTokens(usage?.outputTokens)} tok. ${cache == null ? 'Нет замера кэша' : `Попадание в кэш ${cache}%`}. ${costLabel}. Открыть статистику контекста`;
  return <div className="composer-footer">
    <div className="composer-footer-actions"><ComposerAddButton open={!!menuOpen} disabled={busy} onClick={onMenuToggle} />{planningBadge}</div>
    <div className="composer-model-context">{onModelSaved && onModelBusy && <ModelPicker key={agentId} agentId={agentId} running={running} busy={busy} revision={revision} onSaved={onModelSaved} onBusyChange={onModelBusy} />}
    <HoverPanel id={contextId} open={contextOpen} onOpenChange={setContextOpen} label="Context usage" className="context-panel" trigger={
      <button type="button" className="context-meter" data-level={percent == null ? 'unknown' : percent >= 80 ? 'high' : percent >= 48 ? 'medium' : 'low'} aria-label={`${label}. ${detail}`}>
        <ContextPie percent={percent} /><span>{percent == null ? '—' : `${percent}%`}</span>
      </button>}>
      <ContextDetailsPanel budget={budget} details={details} />
    </HoverPanel></div>
  <div className="composer-usage-line"><button type="button" className="composer-usage" aria-label={usageLabel} aria-haspopup="dialog" aria-expanded={contextOpen} aria-controls={contextOpen ? contextId : undefined} onClick={() => setContextOpen(value => !value)}>{usage?.costUsd != null && <span className="composer-cost" title={usage.price ? `≈ по API-прайсу: $${usage.price.input}/M in, $${usage.price.output}/M out` : undefined}><RollingNumber value={formatUsd(usage.costUsd)} /></span>}<span className="composer-token-count" data-usage="input"><span className="composer-token-arrow" aria-hidden="true">↑</span><RollingNumber value={`${formatTokens(usage?.inputTokens)} tok`} /></span><span className="composer-token-count" data-usage="output"><span className="composer-token-arrow" aria-hidden="true">↓</span><RollingNumber value={`${formatTokens(usage?.outputTokens)} tok`} /></span><span className="composer-cache-hit"><RollingNumber value={cache == null ? 'кэш —' : `${cache}%`} /></span></button></div></div>;
}
