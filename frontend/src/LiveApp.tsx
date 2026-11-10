import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { WorkspaceSidebar } from './components/mauzcode/WorkspaceSidebar';
import { useNavigation } from './hooks/useNavigation';
import { SubagentPanel } from './components/mauzcode/SubagentPanel';
import { ChatHeader } from './components/mauzcode/ChatHeader';
import { Sheet } from './components/layout/Sheet';
import { EdgeSwipe } from './components/layout/EdgeSwipe';
import { SplitPane } from './components/layout/SplitPane';
import { ChatViewport } from './components/layout/ChatViewport';
import { PageViewport } from './components/layout/PageViewport';
import { Button } from './components/ui/Button';
import { CrabMascot } from './components/mauzcode/CrabMascot';
import { LiveComposer } from './components/mauzcode/LiveComposer';
import { ConnectedPlanningPanel } from './components/mauzcode/ConnectedPlanningPanel';
import { ConnectedQuestionCard } from './components/mauzcode/ConnectedQuestionCard';
import { Transcript } from './components/mauzcode/Transcript';
import { useMauzCode } from './hooks/useMauzCode';
import { useCanvas } from './hooks/useCanvas';
import { useTheme } from './hooks/useTheme';
import { NewSessionWelcome } from './components/mauzcode/NewSessionWelcome';
import { NewSessionComposer } from './components/mauzcode/NewSessionComposer';
import { readWorkspaceView, workspaceViewProjects } from './lib/workspaceView';
import { persistNewSessionDraft, readNewSessionDraft, readSessionSelection, rememberSessionSelection, resolveNewSessionProject, type NewSessionDraft } from './lib/newSession';
import { CanvasPanel } from './components/mauzcode/CanvasPanel';
import { QuestionHistoryContext } from './components/mauzcode/QuestionHistory';
import type { HistoryInput } from './lib/history';
import { SettingsDialog, type SettingsTab } from './components/settings/SettingsDialog';
import { SecureInputDialog } from './components/SecureInputDialog';
import { AutomationTasks } from './components/mauzcode/AutomationTasks';
import { PluginsPage } from './components/mauzcode/PluginsPage';
import { PeoplePage } from './components/PeoplePage';
import { SidebarDraftPage } from './components/SidebarDraftPage';
import { ApplicationPages } from './components/mauzcode/ApplicationPages';
import { useQuotas } from './hooks/useQuotas';
import { pluginRuntime, usePluginUi } from './extensions/pluginRuntime';
import { coreGrants } from './extensions/installed';
import { PluginPages } from './components/mauzcode/PluginPages';
import { ExtensionSurface, ExtensionActionButton } from './extensions/ExtensionHost';

export function LiveApp() {
  const [widthControlTarget, setWidthControlTarget] = useState<HTMLSpanElement | null>(null);
  const pluginUi = usePluginUi();
  const installedExtensions = pluginUi.registry;
  useEffect(() => { pluginRuntime.start(); }, []);
  const mauzcode = useMauzCode();
  const [historyInputs, setHistoryInputs] = useState<HistoryInput[]>([]);
  const { theme, themeMode, setTheme } = useTheme();
  const navigation = useNavigation();
  const quotas = useQuotas();
  const [draft, setDraft] = useState(readNewSessionDraft);
  const [draftPending, setDraftPending] = useState(false);
  const isNewSession = !mauzcode.selected;
  const updateDraft = useCallback((next: NewSessionDraft) => { setDraft(next); persistNewSessionDraft(next); if (next.projectId) rememberSessionSelection({ projectId: next.projectId }); }, []);
  useEffect(() => {
    if (!isNewSession || navigation.loading || navigation.error || draftPending) return;
    const available = workspaceViewProjects(navigation.projects, '', { ...readWorkspaceView(), filter: 'active' });
    const projectId = resolveNewSessionProject(available, draft.projectId || readSessionSelection().projectId);
    if (projectId !== draft.projectId) updateDraft({ ...draft, projectId });
  }, [isNewSession, navigation.projects, navigation.loading, navigation.error, draft, draftPending, updateDraft]);
  useEffect(() => {
    const project = navigation.projects.find(project => !project.virtual && project.chats.some(chat => chat.id === mauzcode.selected));
    if (project) rememberSessionSelection({ projectId: project.id });
  }, [mauzcode.selected, navigation.projects]);
  const [sidebarCompact, setSidebarCompact] = useState(() => { try { return localStorage.getItem('mauzcode.ui.sidebar.compact') === 'true'; } catch { return false; } });
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const toggleSidebar = () => setSidebarCompact(value => { try { localStorage.setItem('mauzcode.ui.sidebar.compact', String(!value)); } catch { /* Optional preference. */ } return !value; });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing || (event.key !== '/' && event.code !== 'Slash')) return;
      event.preventDefault();
      if (window.matchMedia('(max-width: 1000px)').matches) setSheetOpen(true);
      else {
        setSheetOpen(false);
        setSidebarCompact(false);
        try { localStorage.setItem('mauzcode.ui.sidebar.compact', 'false'); } catch { /* Optional preference. */ }
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
  const canvasState = useCanvas(nestedCanvas ? null : mauzcode.selected);
  const [sideAgent, setSideAgent] = useState<{ id: string; title: string } | null>(null);
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  const [extensionPanel, setExtensionPanel] = useState<string | null>(null);
  const canvasOpen = canvasState.open || !!sideAgent || !!extensionPanel;
  useEffect(() => { setExtensionPanel(null); }, [mauzcode.selected]);
  useEffect(() => { setSideAgent(null); }, [mauzcode.selected]);
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
    try { const value = Number(localStorage.getItem('mauzcode.canvas.width')); if (value >= 320 && value <= 1600) return value; } catch { /* Storage can be unavailable in private browsing. */ }
    return Math.round(window.innerWidth * .45);
  });
  const previousCanvas = useRef({ agent: mauzcode.selected, open: false, item: null as number | null });
  useEffect(() => {
    const previous = previousCanvas.current;
    // Mount the pane off-screen first, then switch view on a later frame so it slides in instead of popping.
    if (canvasOpen && (!previous.open || previous.item !== canvasState.activeItemId || previous.agent !== mauzcode.selected)) {
      if (!previous.open) { let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setMobileView('canvas')); }); previousCanvas.current = { agent: mauzcode.selected, open: canvasOpen, item: canvasState.activeItemId }; return () => cancelAnimationFrame(frame); }
      setMobileView('canvas');
    }
    if (!canvasOpen) setMobileView('chat');
    previousCanvas.current = { agent: mauzcode.selected, open: canvasOpen, item: canvasState.activeItemId };
  }, [canvasOpen, canvasState.activeItemId, mauzcode.selected]);
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
  const resizeCanvas = (width: number) => { setCanvasWidth(width); setCanvasExpanded(false); try { localStorage.setItem('mauzcode.canvas.width', String(width)); } catch { /* Resizing still works without persistence. */ } };

  const selectedChat = navigation.projects.flatMap(project => project.chats).find(chat => chat.id === mauzcode.selected);
  const archived = !isNewSession && (!!selectedChat?.archived || !!mauzcode.page?.archived);
  const canvasUnavailable = !mauzcode.selected || nestedCanvas || archived;
  const showCanvas = () => { if (canvasUnavailable) return; if (canvasOpen) setMobileView('canvas'); else void canvasState.setOpen(true); };
  const readOnly = archived || !mauzcode.page || (mauzcode.page.archived == null && !selectedChat);
  const current = mauzcode.agents.find(item => item.id === mauzcode.selected) ?? selectedChat;
  const requestedSettings = new URLSearchParams(location.search).get('settings');
  const [settingsOpen, setSettingsOpen] = useState(requestedSettings === 'ssh-instances' || requestedSettings === 'llm-connections' || requestedSettings === 'push-notifications' || requestedSettings === 'updates');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(requestedSettings === 'push-notifications' ? 'push-notifications' : requestedSettings === 'llm-connections' ? 'llm-connections' : requestedSettings === 'updates' ? 'updates' : 'ssh-instances');
  const changeSettingsOpen = (open: boolean) => {
    setSettingsOpen(open);
    if (!open) { const url = new URL(location.href); url.searchParams.delete('settings'); history.replaceState(null, '', url); }
  };
  const openSettings = useCallback(() => { setSheetOpen(false); setSettingsOpen(true); }, []);
  const openQuotas = useCallback(() => { setSheetOpen(false); setSettingsTab('llm-connections'); setSettingsOpen(true); }, []);
  type PageView = 'automation' | 'plugins' | 'people' | 'applications' | 'pages' | `extension:${string}` | null;
  const readView = (): PageView => { const v = new URL(location.href).searchParams.get('view'); return v === 'automation' || v === 'plugins' || v === 'people' || v === 'applications' || v === 'pages' ? v : /^extension:[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(v ?? '') ? v as PageView : null; }; // runtime plugins load after first render
  const [pageView, setPageViewState] = useState<PageView>(readView);
  const setPageView = (next: PageView) => { setPageViewState(next); const url = new URL(location.href); if (next) url.searchParams.set('view', next); else url.searchParams.delete('view'); history.replaceState(null, '', url); };
  const automation = pageView === 'automation';
  const openPage = (next: Exclude<PageView, null>) => { setPageView(next); setSheetOpen(false); setMobileView('chat'); };
  const openAutomation = () => openPage('automation');
  const openPlugins = () => openPage('plugins');
  const extensionContext = { agentId: mauzcode.selected || null, theme, readOnly };
  const extensionPage = installedExtensions.pages.find(page => `extension:${page.key}` === pageView);
  const activeExtensionPanel = installedExtensions.panels.find(panel => panel.key === extensionPanel);
  const extensionNavigation = [{ key: 'applications', title: 'Приложения', active: pageView === 'applications', onSelect: () => openPage('applications') }, ...[...installedExtensions.navigation.filter(item => Object.hasOwn(coreGrants, item.key.split('/')[0])), ...installedExtensions.sidebarNavigation].map(item => ({ ...item, active: pageView === `extension:${item.key}`, onSelect: () => openPage(`extension:${item.key}`) }))];
  const pluginPages = installedExtensions.navigation.filter(item => !Object.hasOwn(coreGrants, item.key.split('/')[0])).map(item => ({ ...item, active: pageView === `extension:${item.key}`, onSelect: () => openPage(`extension:${item.key}`) }));
  const sidebarBindingId = new URL(location.href).searchParams.get('sidebarDraft');
  const selectChat = (id: string) => { if (draftPending) return; setPageView(null); mauzcode.select(id); setSheetOpen(false); setMobileView('chat'); };
  const startNewSession = (projectId?: string) => {
    if (draftPending) return;
    const last = readSessionSelection();
    const available = workspaceViewProjects(navigation.projects, '', { ...readWorkspaceView(), filter: 'active' });
    const model = last.model || draft.model;
    updateDraft({ ...draft, projectId: resolveNewSessionProject(available, projectId || last.projectId || draft.projectId), model,
      effort: model === draft.model ? draft.effort : '', requestKey: crypto.randomUUID() });
    selectChat('');
  };
  const created = (id: string) => { setDraftPending(false); setDraft(readNewSessionDraft()); navigation.refresh(); mauzcode.select(id); setSheetOpen(false); setMobileView('chat'); };
  const sidebar = (mobile = false) => <WorkspaceSidebar {...navigation} extensionNavigation={extensionNavigation} onOpenPages={() => openPage('pages')} pagesActive={pageView === 'pages'} onOpenPeople={() => openPage('people')} peopleActive={pageView === 'people'} onOpenAutomation={openAutomation} automationActive={automation} onOpenPlugins={openPlugins} pluginsActive={pageView === 'plugins'} onOpenSettings={openSettings} onProjectAction={(id, action) => { void navigation.actProject(id, action); }} onNewSession={startNewSession} draftProjectId={isNewSession && !pageView ? draft.projectId : undefined} onAction={(id, action) => { void navigation.act(id, action).then(ok => { if (ok) mauzcode.refresh(); }); }} selected={pageView ? '' : mauzcode.selected} compact={!mobile && sidebarCompact} mobile={mobile} theme={theme} themeMode={themeMode} onTheme={setTheme} onToggle={mobile ? () => setSheetOpen(false) : toggleSidebar} onSelect={selectChat} searchInputRef={mobile ? mobileSearchRef : desktopSearchRef} onRetry={navigation.refresh} quotas={quotas.accounts} onOpenQuotas={openQuotas} />;
  const canvas = mauzcode.selected && !nestedCanvas ? <CanvasPanel agentId={mauzcode.selected} revision={canvasState.rev} theme={theme} onClose={closeCanvas} expanded={canvasExpanded} onExpand={() => setCanvasExpanded(!canvasExpanded)} /> : null;
  const chat = <section className={`chat-panel ${isNewSession ? 'new-session-panel' : ''} ${archived ? 'is-archived' : ''}`} aria-label="Чат">
    <ChatHeader onMenu={embedded ? undefined : () => setSheetOpen(true)} active={!!mauzcode.page?.isRunning || current?.runState === 'running' || current?.runState === 'claimed' || !!selectedChat?.teamRunningCount} icon={selectedChat?.icon} colorHue={selectedChat?.colorHue} widthControlRef={setWidthControlTarget} key={mauzcode.selected || 'new'} agentId={mauzcode.selected || ''} title={isNewSession ? 'New Session' : current?.title || `Агент ${mauzcode.selected}`} archived={archived} canvasOpen={canvasOpen} canvasDisabled={!mauzcode.selected || nestedCanvas || archived} onCanvas={() => { if (sideAgent) { setSideAgent(null); setMobileView('chat'); } else if (canvasOpen && mobileView === 'chat' && window.matchMedia('(max-width: 1000px)').matches) { setMobileView('canvas'); } else { void canvasState.setOpen(!canvasOpen); } }} onSelect={selectChat} onOpenSide={nestedCanvas ? undefined : (id, title) => { setSideAgent({ id, title }); setMobileView('canvas'); }} onRenamed={() => { navigation.refresh(); mauzcode.refresh(); }} />
    <div className="mauzcode-extension-tools" aria-label="Расширения разговора">
      {installedExtensions.panels.map(panel => <Button key={panel.key} disabled={canvasUnavailable} onClick={() => { setExtensionPanel(panel.key); setMobileView('canvas'); }}>{panel.title}</Button>)}
      {installedExtensions.actions.map(action => <ExtensionActionButton key={action.key} action={action} context={extensionContext} />)}
    </div>
    <ChatViewport disabled={archived} widthControlTarget={widthControlTarget}>
    {canvasState.error && <div className="connection-error" role="alert">{canvasState.error} <Button onClick={canvasState.refresh}>Повторить</Button></div>}
    {mauzcode.error && <div className="connection-error" role="alert">{mauzcode.error} <Button onClick={mauzcode.refresh}>Повторить</Button> <a href={`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Войти в MauzCode</a></div>}
    {mauzcode.liveError && <div className="transcript-notice" role="status">{mauzcode.liveError}</div>}
    {archived && <p className="archived-chat-notice" role="status">Чат в архиве. Разархивируйте его в боковом меню, чтобы продолжить.</p>}
    <fieldset disabled={archived} inert={archived} className={`chat-readonly-boundary ${archived ? 'is-archived' : ''}`} aria-label={archived ? 'Архивный разговор — только чтение' : undefined} onClickCapture={event => { if (archived && (event.target as Element).closest('button,a,input,select,textarea')) { event.preventDefault(); event.stopPropagation(); } }}>
    {isNewSession ? <NewSessionWelcome userName={navigation.user?.name || ''} /> : mauzcode.loading ? <div className="chat-scroll" role="status">Загружаем разговор…</div> : mauzcode.selected && <QuestionHistoryContext.Provider value={historyInputs.filter(input => input.agentId === mauzcode.selected)}><Transcript key={mauzcode.selected} agentId={mauzcode.selected} events={mauzcode.events} page={mauzcode.page} hasOlder={mauzcode.hasOlder} loadingOlder={mauzcode.loadingOlder} loadOlder={mauzcode.loadOlder} outline={mauzcode.outline} loadThrough={mauzcode.loadThrough} /></QuestionHistoryContext.Provider>}
    </fieldset>
    <div className="chat-bottom">{isNewSession ? <NewSessionComposer draft={draft} onChange={updateDraft} projects={navigation.projects} onCreated={created} onPending={setDraftPending} /> : mauzcode.selected && !mauzcode.loading && mauzcode.page && <ConnectedQuestionCard key={`questions:${mauzcode.selected}`} agentId={mauzcode.selected} readOnly={readOnly} onAccepted={mauzcode.refresh} onInputs={setHistoryInputs} mascot={<CrabMascot page={mauzcode.page} />}><ConnectedPlanningPanel key={`planning:${mauzcode.selected}`} agentId={mauzcode.selected} running={!!mauzcode.page.isRunning} readOnly={readOnly} onAccepted={mauzcode.refresh}>{(planningBadge, _reviewPending, focusRequest) => <><LiveComposer focusRequest={focusRequest} key={mauzcode.selected!} readOnly={readOnly} agentId={mauzcode.selected!} running={!!mauzcode.page?.isRunning} onAccepted={mauzcode.refresh} planningBadge={planningBadge} /></>}</ConnectedPlanningPanel></ConnectedQuestionCard>}</div>
    </ChatViewport>
  </section>;
  return <><div className={embedded ? 'embedded-chat-marker' : ''} hidden /><div hidden data-live-topic="agents" /><div hidden data-live-topic={mauzcode.selected ? `agent:${mauzcode.selected}` : 'agents'} /><div hidden data-live-topic={mauzcode.selected ? `agent:${mauzcode.selected}:stream` : 'agents'} />
    <AppShell sidebarVisible={!embedded} sidebar={embedded ? null : sidebar()} sidebarCompact={sidebarCompact} workspaceNav>
      <div style={paneDrag == null ? undefined : { '--pane-drag': `${paneDrag}px` } as React.CSSProperties} className={`workspace-layout live-workspace view-${mobileView} ${paneDrag == null ? '' : 'pane-dragging'} ${canvasOpen ? 'has-canvas' : 'no-canvas'} ${canvasExpanded ? 'canvas-expanded' : ''}`}><SplitPane primary={<PageViewport active={!!(sidebarBindingId || pageView || automation)}>{sidebarBindingId ? <SidebarDraftPage bindingId={sidebarBindingId} onCreated={id => { const url = new URL(location.href); url.searchParams.delete('sidebarDraft'); url.searchParams.set('agent', id); url.searchParams.set('presentation', 'sidebar'); history.replaceState(null, '', url); created(id); }} /> : pageView === 'people' ? <PeoplePage /> : pageView === 'pages' ? <PluginPages pages={pluginPages} loaded={pluginUi.loaded} onOpen={key => openPage(`extension:${key}`)} /> : pageView === 'applications' ? <ApplicationPages theme={theme} /> : extensionPage ? <ExtensionSurface view={extensionPage} context={{ agentId: null, theme, readOnly: navigation.canManage !== true }} onClose={() => setPageView(null)} /> : pageView?.startsWith('extension:') ? <p role="status" className="extension-page-pending">{pluginUi.loaded ? 'Страница недоступна: расширение не загружено или не одобрено.' : 'Загрузка расширения…'}</p> : automation ? <AutomationTasks /> : pageView === 'plugins' ? <PluginsPage onOpenAgent={selectChat} /> : chat}</PageViewport>} secondary={pageView ? null : activeExtensionPanel ? <ExtensionSurface view={activeExtensionPanel} context={extensionContext} onClose={() => setExtensionPanel(null)} /> : sideAgent ? <SubagentPanel id={sideAgent.id} title={sideAgent.title} onClose={closeSecondary} /> : canvas} label="Ширина Canvas" secondaryWidth={canvasWidth} onWidthChange={resizeCanvas} maxWidth={1600} /></div>
    </AppShell>{!embedded && <SecureInputDialog />}<SettingsDialog open={settingsOpen} tab={settingsTab} onTab={setSettingsTab} onOpenChange={changeSettingsOpen} />{!embedded && <><EdgeSwipe side="right" label="Свайп влево — открыть Canvas" onDrag={setPaneDrag} disabled={mobileView !== 'chat' || canvasUnavailable} onSwipe={showCanvas} /><EdgeSwipe side="left" label="Свайп вправо — закрыть Canvas" onDrag={setPaneDrag} disabled={mobileView !== 'canvas'} onSwipe={closeSecondary} /></>}<Sheet hideHeader swipeToOpen={!embedded && mobileView === 'chat'} title="Рабочее пространство" open={sheetOpen} onOpenChange={setSheetOpen} initialFocus={mobileSearchRef}>{sidebar(true)}</Sheet>
  </>;
}
