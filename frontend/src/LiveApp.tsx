import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { WorkspaceSidebar } from './components/hyper/WorkspaceSidebar';
import { useNavigation } from './hooks/useNavigation';
import { SubagentPanel } from './components/hyper/SubagentPanel';
import { ChatHeader } from './components/hyper/ChatHeader';
import { Sheet } from './components/layout/Sheet';
import { EdgeSwipe } from './components/layout/EdgeSwipe';
import { SplitPane } from './components/layout/SplitPane';
import { ChatViewport } from './components/layout/ChatViewport';
import { Button } from './components/ui/Button';
import { CrabMascot } from './components/hyper/CrabMascot';
import { LiveComposer } from './components/hyper/LiveComposer';
import { ConnectedPlanningPanel } from './components/hyper/ConnectedPlanningPanel';
import { ConnectedQuestionCard } from './components/hyper/ConnectedQuestionCard';
import { Transcript } from './components/hyper/Transcript';
import { useHyper } from './hooks/useHyper';
import { useCanvas } from './hooks/useCanvas';
import { useTheme } from './hooks/useTheme';
import { NewSessionWelcome } from './components/hyper/NewSessionWelcome';
import { NewSessionComposer } from './components/hyper/NewSessionComposer';
import { readWorkspaceView, workspaceViewProjects } from './lib/workspaceView';
import { persistNewSessionDraft, readNewSessionDraft, readSessionSelection, rememberSessionSelection, resolveNewSessionProject, type NewSessionDraft } from './lib/newSession';
import { CanvasPanel } from './components/hyper/CanvasPanel';
import { QuestionHistoryContext } from './components/hyper/QuestionHistory';
import type { ChoiceInput } from './lib/questions';
import { SettingsDialog, type SettingsTab } from './components/settings/SettingsDialog';
import { AutomationTasks } from './components/hyper/AutomationTasks';
import { PluginsPage } from './components/hyper/PluginsPage';
import { useQuotas } from './hooks/useQuotas';
import { installedExtensions } from './extensions/installed';
import { ExtensionSurface, ExtensionActionButton } from './extensions/ExtensionHost';

export function LiveApp() {
  const [widthControlTarget, setWidthControlTarget] = useState<HTMLSpanElement | null>(null);
  const hyper = useHyper();
  const [historyInputs, setHistoryInputs] = useState<ChoiceInput[]>([]);
  const { theme, themeMode, setTheme } = useTheme();
  const navigation = useNavigation();
  const quotas = useQuotas();
  const [draft, setDraft] = useState(readNewSessionDraft);
  const [draftPending, setDraftPending] = useState(false);
  const isNewSession = !hyper.selected;
  const updateDraft = useCallback((next: NewSessionDraft) => { setDraft(next); persistNewSessionDraft(next); if (next.projectId) rememberSessionSelection({ projectId: next.projectId }); }, []);
  useEffect(() => {
    if (!isNewSession || navigation.loading || navigation.error || draftPending) return;
    const available = workspaceViewProjects(navigation.projects, '', { ...readWorkspaceView(), filter: 'active' });
    const projectId = resolveNewSessionProject(available, draft.projectId || readSessionSelection().projectId);
    if (projectId !== draft.projectId) updateDraft({ ...draft, projectId });
  }, [isNewSession, navigation.projects, navigation.loading, navigation.error, draft, draftPending, updateDraft]);
  useEffect(() => {
    const project = navigation.projects.find(project => !project.virtual && project.chats.some(chat => chat.id === hyper.selected));
    if (project) rememberSessionSelection({ projectId: project.id });
  }, [hyper.selected, navigation.projects]);
  const [sidebarCompact, setSidebarCompact] = useState(() => { try { return localStorage.getItem('hyper.ui.sidebar.compact') === 'true'; } catch { return false; } });
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const toggleSidebar = () => setSidebarCompact(value => { try { localStorage.setItem('hyper.ui.sidebar.compact', String(!value)); } catch { /* Optional preference. */ } return !value; });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing || (event.key !== '/' && event.code !== 'Slash')) return;
      event.preventDefault();
      if (window.matchMedia('(max-width: 1000px)').matches) setSheetOpen(true);
      else {
        setSheetOpen(false);
        setSidebarCompact(false);
        try { localStorage.setItem('hyper.ui.sidebar.compact', 'false'); } catch { /* Optional preference. */ }
      }
      setSearchFocusRequest(value => value + 1);
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => {
    if (!searchFocusRequest) return;
    const input = window.matchMedia('(max-width: 1000px)').matches ? mobileSearchRef.current : desktopSearchRef.current;
    input?.focus();
    input?.select();
  }, [searchFocusRequest]);
  // A saved URL tab can point back at this very UI. Do not recursively embed its Canvas.
  const [nestedCanvas] = useState(() => {
    try { let parent = window.parent; while (parent !== window) { if (parent.location.pathname.startsWith('/ui-lab')) return true; if (parent === parent.parent) break; parent = parent.parent; } } catch { /* A cross-origin ancestor is outside our shell. */ }
    return false;
  });
  const canvasState = useCanvas(nestedCanvas ? null : hyper.selected);
  const [sideAgent, setSideAgent] = useState<{ id: string; title: string } | null>(null);
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  const [extensionPanel, setExtensionPanel] = useState<string | null>(null);
  const canvasOpen = canvasState.open || !!sideAgent || !!extensionPanel;
  useEffect(() => { setExtensionPanel(null); }, [hyper.selected]);
  useEffect(() => { setSideAgent(null); }, [hyper.selected]);
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');
  const [paneDrag, setPaneDrag] = useState<number | null>(null);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  // Full-window Canvas ends with the Canvas itself; Escape restores the split.
  useEffect(() => { if (!canvasOpen || sideAgent) setCanvasExpanded(false); }, [canvasOpen, sideAgent]);
  useEffect(() => {
    if (!canvasExpanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) setCanvasExpanded(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [canvasExpanded]);
  const [canvasWidth, setCanvasWidth] = useState(() => {
    try { const value = Number(localStorage.getItem('hyper.canvas.width')); if (value >= 320 && value <= 1600) return value; } catch { /* Storage can be unavailable in private browsing. */ }
    return Math.round(window.innerWidth * .45);
  });
  const previousCanvas = useRef({ agent: hyper.selected, open: false, item: null as number | null });
  useEffect(() => {
    const previous = previousCanvas.current;
    // Mount the pane off-screen first, then switch view on a later frame so it slides in instead of popping.
    if (canvasOpen && (!previous.open || previous.item !== canvasState.activeItemId || previous.agent !== hyper.selected)) {
      if (!previous.open) { let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setMobileView('canvas')); }); previousCanvas.current = { agent: hyper.selected, open: canvasOpen, item: canvasState.activeItemId }; return () => cancelAnimationFrame(frame); }
      setMobileView('canvas');
    }
    if (!canvasOpen) setMobileView('chat');
    previousCanvas.current = { agent: hyper.selected, open: canvasOpen, item: canvasState.activeItemId };
  }, [canvasOpen, canvasState.activeItemId, hyper.selected]);
  /** Hide Canvas (or the side agent panel). On mobile the pane slides out first and is closed after the animation. */
  const closeSecondary = () => {
    const close = () => { if (extensionPanel) setExtensionPanel(null); else if (sideAgent) setSideAgent(null); else void canvasState.setOpen(false); };
    const mobile = window.matchMedia?.('(max-width: 1000px)').matches;
    setMobileView('chat');
    if (!mobile || mobileView !== 'canvas') { close(); return; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(close, reduced ? 0 : 320);
  };
  const closeCanvas = closeSecondary;
  const resizeCanvas = (width: number) => { setCanvasWidth(width); setCanvasExpanded(false); try { localStorage.setItem('hyper.canvas.width', String(width)); } catch { /* Resizing still works without persistence. */ } };

  const selectedChat = navigation.projects.flatMap(project => project.chats).find(chat => chat.id === hyper.selected);
  const archived = !isNewSession && (!!selectedChat?.archived || !!hyper.page?.archived);
  const canvasUnavailable = !hyper.selected || nestedCanvas || archived;
  const showCanvas = () => { if (canvasUnavailable) return; if (canvasOpen) setMobileView('canvas'); else void canvasState.setOpen(true); };
  const readOnly = archived || !hyper.page || (hyper.page.archived == null && !selectedChat);
  const current = hyper.agents.find(item => item.id === hyper.selected) ?? selectedChat;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ssh-instances');
  const openSettings = useCallback(() => { setSheetOpen(false); setSettingsOpen(true); }, []);
  const openQuotas = useCallback(() => { setSheetOpen(false); setSettingsTab('llm-connections'); setSettingsOpen(true); }, []);
  type PageView = 'automation' | 'plugins' | `extension:${string}` | null;
  const readView = (): PageView => { const v = new URL(location.href).searchParams.get('view'); return v === 'automation' || v === 'plugins' ? v : installedExtensions.pages.some(page => `extension:${page.key}` === v) ? v as PageView : null; };
  const [pageView, setPageViewState] = useState<PageView>(readView);
  const setPageView = (next: PageView) => { setPageViewState(next); const url = new URL(location.href); if (next) url.searchParams.set('view', next); else url.searchParams.delete('view'); history.replaceState(null, '', url); };
  const automation = pageView === 'automation';
  const openPage = (next: Exclude<PageView, null>) => { setPageView(next); setSheetOpen(false); setMobileView('chat'); };
  const openAutomation = () => openPage('automation');
  const openPlugins = () => openPage('plugins');
  const extensionContext = { agentId: hyper.selected || null, theme, readOnly };
  const extensionPage = installedExtensions.pages.find(page => `extension:${page.key}` === pageView);
  const activeExtensionPanel = installedExtensions.panels.find(panel => panel.key === extensionPanel);
  const extensionNavigation = installedExtensions.navigation.map(item => ({ ...item, active: pageView === `extension:${item.key}`, onSelect: () => openPage(`extension:${item.key}`) }));
  const selectChat = (id: string) => { if (draftPending) return; setPageView(null); hyper.select(id); setSheetOpen(false); setMobileView('chat'); };
  const startNewSession = (projectId?: string) => {
    if (draftPending) return;
    const last = readSessionSelection();
    const available = workspaceViewProjects(navigation.projects, '', { ...readWorkspaceView(), filter: 'active' });
    const model = last.model || draft.model;
    updateDraft({ ...draft, projectId: resolveNewSessionProject(available, projectId || last.projectId || draft.projectId), model,
      effort: model === draft.model ? draft.effort : '', requestKey: crypto.randomUUID() });
    selectChat('');
  };
  const created = (id: string) => { setDraftPending(false); setDraft(readNewSessionDraft()); navigation.refresh(); hyper.select(id); setSheetOpen(false); setMobileView('chat'); };
  const sidebar = (mobile = false) => <WorkspaceSidebar {...navigation} extensionNavigation={extensionNavigation} onOpenAutomation={openAutomation} automationActive={automation} onOpenPlugins={openPlugins} pluginsActive={pageView === 'plugins'} onOpenSettings={openSettings} onProjectAction={(id, action) => { void navigation.actProject(id, action); }} onNewSession={startNewSession} draftProjectId={isNewSession && !pageView ? draft.projectId : undefined} onAction={(id, action) => { void navigation.act(id, action).then(ok => { if (ok) hyper.refresh(); }); }} selected={pageView ? '' : hyper.selected} compact={!mobile && sidebarCompact} mobile={mobile} theme={theme} themeMode={themeMode} onTheme={setTheme} onToggle={mobile ? () => setSheetOpen(false) : toggleSidebar} onSelect={selectChat} searchInputRef={mobile ? mobileSearchRef : desktopSearchRef} onRetry={navigation.refresh} quotas={quotas.accounts} onOpenQuotas={openQuotas} />;
  const canvas = hyper.selected && !nestedCanvas ? <CanvasPanel agentId={hyper.selected} revision={canvasState.rev} theme={theme} onClose={closeCanvas} expanded={canvasExpanded} onExpand={() => setCanvasExpanded(!canvasExpanded)} /> : null;
  const chat = <section className={`chat-panel ${isNewSession ? 'new-session-panel' : ''} ${archived ? 'is-archived' : ''}`} aria-label="Чат">
    <ChatHeader onMenu={embedded ? undefined : () => setSheetOpen(true)} active={!!hyper.page?.isRunning || current?.runState === 'running' || current?.runState === 'claimed' || !!selectedChat?.teamRunningCount} icon={selectedChat?.icon} colorHue={selectedChat?.colorHue} widthControlRef={setWidthControlTarget} key={hyper.selected || 'new'} agentId={hyper.selected || ''} title={isNewSession ? 'New Session' : current?.title || `Агент ${hyper.selected}`} archived={archived} canvasOpen={canvasOpen} canvasDisabled={!hyper.selected || nestedCanvas || archived} onCanvas={() => { if (sideAgent) { setSideAgent(null); setMobileView('chat'); } else if (canvasOpen && mobileView === 'chat' && window.matchMedia('(max-width: 1000px)').matches) { setMobileView('canvas'); } else { void canvasState.setOpen(!canvasOpen); } }} onSelect={selectChat} onOpenSide={nestedCanvas ? undefined : (id, title) => { setSideAgent({ id, title }); setMobileView('canvas'); }} onRenamed={() => { navigation.refresh(); hyper.refresh(); }} />
    <div className="hyper-extension-tools" aria-label="Расширения разговора">
      {installedExtensions.panels.map(panel => <Button key={panel.key} disabled={canvasUnavailable} onClick={() => { setExtensionPanel(panel.key); setMobileView('canvas'); }}>{panel.title}</Button>)}
      {installedExtensions.actions.map(action => <ExtensionActionButton key={action.key} action={action} context={extensionContext} />)}
    </div>
    <ChatViewport disabled={archived} widthControlTarget={widthControlTarget}>
    {canvasState.error && <div className="connection-error" role="alert">{canvasState.error} <Button onClick={canvasState.refresh}>Повторить</Button></div>}
    {hyper.error && <div className="connection-error" role="alert">{hyper.error} <Button onClick={hyper.refresh}>Повторить</Button> <a href={`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Войти в Hyper</a></div>}
    {hyper.liveError && <div className="transcript-notice" role="status">{hyper.liveError}</div>}
    {archived && <p className="archived-chat-notice" role="status">Чат в архиве. Разархивируйте его в боковом меню, чтобы продолжить.</p>}
    <fieldset disabled={archived} inert={archived} className={`chat-readonly-boundary ${archived ? 'is-archived' : ''}`} aria-label={archived ? 'Архивный разговор — только чтение' : undefined} onClickCapture={event => { if (archived && (event.target as Element).closest('button,a,input,select,textarea')) { event.preventDefault(); event.stopPropagation(); } }}>
    {isNewSession ? <NewSessionWelcome userName={navigation.user?.name || ''} /> : hyper.loading ? <div className="chat-scroll" role="status">Загружаем разговор…</div> : hyper.selected && <QuestionHistoryContext.Provider value={historyInputs.filter(input => input.agentId === hyper.selected)}><Transcript key={hyper.selected} agentId={hyper.selected} events={hyper.events} page={hyper.page} hasOlder={hyper.hasOlder} loadingOlder={hyper.loadingOlder} loadOlder={hyper.loadOlder} outline={hyper.outline} loadThrough={hyper.loadThrough} /></QuestionHistoryContext.Provider>}
    </fieldset>
    <div className="chat-bottom">{isNewSession ? <NewSessionComposer draft={draft} onChange={updateDraft} projects={navigation.projects} onCreated={created} onPending={setDraftPending} /> : hyper.selected && !hyper.loading && hyper.page && <ConnectedQuestionCard key={`questions:${hyper.selected}`} agentId={hyper.selected} readOnly={readOnly} onAccepted={hyper.refresh} onInputs={setHistoryInputs} mascot={<CrabMascot page={hyper.page} />}><ConnectedPlanningPanel key={`planning:${hyper.selected}`} agentId={hyper.selected} running={!!hyper.page.isRunning} readOnly={readOnly} onAccepted={hyper.refresh}>{planningBadge => <LiveComposer key={hyper.selected!} readOnly={readOnly} agentId={hyper.selected!} running={!!hyper.page?.isRunning} onAccepted={hyper.refresh} planningBadge={planningBadge} />}</ConnectedPlanningPanel></ConnectedQuestionCard>}</div>
    </ChatViewport>
  </section>;
  return <><div className={embedded ? 'embedded-chat-marker' : ''} hidden /><div hidden data-live-topic="agents" /><div hidden data-live-topic={hyper.selected ? `agent:${hyper.selected}` : 'agents'} /><div hidden data-live-topic={hyper.selected ? `agent:${hyper.selected}:stream` : 'agents'} />
    <AppShell sidebarVisible={!embedded} sidebar={embedded ? null : sidebar()} sidebarCompact={sidebarCompact} workspaceNav>
      <div style={paneDrag == null ? undefined : { '--pane-drag': `${paneDrag}px` } as React.CSSProperties} className={`workspace-layout live-workspace view-${mobileView} ${paneDrag == null ? '' : 'pane-dragging'} ${canvasOpen ? 'has-canvas' : 'no-canvas'} ${canvasExpanded ? 'canvas-expanded' : ''}`}><SplitPane primary={extensionPage ? <ExtensionSurface view={extensionPage} context={extensionContext} onClose={() => setPageView(null)} /> : automation ? <AutomationTasks /> : pageView === 'plugins' ? <PluginsPage onOpenAgent={selectChat} /> : chat} secondary={pageView ? null : activeExtensionPanel ? <ExtensionSurface view={activeExtensionPanel} context={extensionContext} onClose={() => setExtensionPanel(null)} /> : sideAgent ? <SubagentPanel id={sideAgent.id} title={sideAgent.title} onClose={closeSecondary} /> : canvas} label="Ширина Canvas" secondaryWidth={canvasWidth} onWidthChange={resizeCanvas} maxWidth={1600} /></div>
    </AppShell><SettingsDialog open={settingsOpen} tab={settingsTab} onTab={setSettingsTab} onOpenChange={setSettingsOpen} />{!embedded && <><EdgeSwipe side="right" label="Свайп влево — открыть Canvas" onDrag={setPaneDrag} disabled={mobileView !== 'chat' || canvasUnavailable} onSwipe={showCanvas} /><EdgeSwipe side="left" label="Свайп вправо — закрыть Canvas" onDrag={setPaneDrag} disabled={mobileView !== 'canvas'} onSwipe={closeSecondary} /></>}<Sheet hideHeader swipeToOpen={!embedded && mobileView === 'chat'} title="Рабочее пространство" open={sheetOpen} onOpenChange={setSheetOpen} initialFocus={mobileSearchRef}>{sidebar(true)}</Sheet>
  </>;
}
