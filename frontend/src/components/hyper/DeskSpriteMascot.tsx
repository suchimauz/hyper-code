import { useEffect, useRef, useState } from 'react';
import type { EventPage } from '../../lib/hyper';
import '../../vendor/desksprite/desksprite.js';
import type { DeskSpriteController, DeskSpriteStatus } from '../../vendor/desksprite/desksprite';
import './desk-sprite-mascot.css';

/** Local, pinned DeskSprite engine. Its DOM belongs only to the empty mount. */
export function DeskSpriteMascot({ page }: { page: EventPage | null }) {
  return <MountedDeskSprite key={page?.agentId ?? 'new'} page={page} />;
}
function MountedDeskSprite({ page }: { page: EventPage | null }) {
  const mount = useRef<HTMLDivElement>(null);
  const controller = useRef<DeskSpriteController | null>(null);
  const wasBusy = useRef(false);
  const busy = !!(page?.isRunning || page?.thinking || page?.activeTools?.length);
  const error = !!page?.lastError;
  const [status, setStatus] = useState<DeskSpriteStatus>('idle');
  const [showCaption, setShowCaption] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const staticStatus = reduced ? status : undefined;
  useEffect(() => {
    if (!mount.current) return;
    // The engine snapshots reduced-motion on start. Recreate on preference change.
    const pet = window.DeskSprite.start({ mount: mount.current, roam: false,
      clock: false, lunch: false, scale: 80 / 238, status: staticStatus,
      messages: { working: '', done: '', error: '', seat: '' } });
    controller.current = pet;
    return () => { controller.current = null; pet.destroy(); };
  }, [reduced, staticStatus]);
  useEffect(() => {
    const completed = wasBusy.current && !busy;
    wasBusy.current = busy;
    setStatus(error ? 'error' : busy ? 'working' : completed ? 'done' : 'idle');
    if (!error && completed) {
      const timer = window.setTimeout(() => setStatus('idle'), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [busy, error]);
  useEffect(() => { controller.current?.setStatus(status); }, [status, reduced, staticStatus]);
  const label = status === 'error' ? 'Ошибка агента' : status === 'done' ? 'Готово' : status === 'working'
    ? page?.activeTools?.length ? 'Выполняет инструмент' : page?.thinking ? 'Думает' : 'Работает' : 'Отдыхает';
  return <div className="desk-sprite-mascot" data-status={status}>
    <div className="desk-sprite-mount" ref={mount} aria-hidden="true" />
    <button type="button" className="desk-sprite-hit" aria-label={`DeskSprite: ${label}`}
      title={`DeskSprite: ${label}. Питомец остаётся за столом.`}
      aria-expanded={showCaption} onClick={() => setShowCaption(value => !value)} />
    {showCaption && <span className="desk-sprite-caption" role="status">{label}</span>}
  </div>;
}
