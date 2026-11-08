import { useEffect, useState } from 'react';
import { getCommands, type CommandDescriptor } from '../lib/commands';

export type ComposerCommand = CommandDescriptor & { section: 'Add' | 'Commands'; label: string; disabled?: boolean };
/** One catalogue and selection state for both the + button and the slash trigger.
 * Follows dsh-client-ui-commands' contribution/leading-input distinction (MIT).
 */
export function useCommandMenu(value: string, enabled: boolean, options: { plusOpen?: boolean; claimed?: boolean; onClose?: () => void; file?: boolean; compact?: boolean; running?: boolean } = {}) {
  const [commands, setCommands] = useState<CommandDescriptor[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const query = !options.claimed ? /^\s*\/([a-z0-9_-]*)$/.exec(value)?.[1] : undefined;
  const wanted = enabled && (options.plusOpen || query !== undefined);
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    setStatus('loading'); setError('');
    void getCommands(controller.signal).then(result => {
      if (!controller.signal.aborted) { setCommands(result.commands); setStatus('ready'); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus('error'); }
    });
    return () => controller.abort();
  }, [wanted, retry]);
  useEffect(() => { setIndex(0); setDismissed(null); }, [value, options.plusOpen]);
  const rows: ComposerCommand[] = [
    ...(options.file ? [{ name: 'file', label: 'File', section: 'Add' as const, description: '', usage: [] }] : []),
    { name: 'goal', label: 'Goal', section: 'Commands', description: 'Открыть или изменить цель агента', inputHint: '/goal [цель]', usage: ['/goal', '/goal <цель>'] },
    ...commands.filter(command => command.name !== 'goal').map(command => ({ ...command, label: command.name === 'plan' ? 'Plan' : command.name === 'compact' ? 'Compact' : command.name, section: command.name === 'plan' ? 'Add' as const : 'Commands' as const, disabled: !!options.running || (command.name === 'compact' && !options.compact) })),
  ];
  const filter = options.plusOpen ? '' : query || '';
  const matches = rows.filter(command => command.name.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => Number(a.section === 'Commands') - Number(b.section === 'Commands'));
  return { open: !!wanted && (options.plusOpen || dismissed !== value), matches, commands, status, error, index: Math.min(index, Math.max(0, matches.length - 1)), setIndex,
    dismiss: () => { setDismissed(value); options.onClose?.(); }, retry: () => setRetry(n => n + 1) };
}
