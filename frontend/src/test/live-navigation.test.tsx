import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveApp } from '../LiveApp';
import { useHyper } from '../hooks/useHyper';
import { useCanvas } from '../hooks/useCanvas';
import { useNavigation } from '../hooks/useNavigation';
vi.mock('../hooks/useHyper'); vi.mock('../hooks/useCanvas'); vi.mock('../hooks/useNavigation');
// Quota polling is its own fetch; these tests assert that shortcuts never trigger global search fetches.
vi.mock('../hooks/useQuotas', () => ({ useQuotas: () => ({ accounts: null, error: null }) }));
vi.mock('../lib/chatHeader', () => ({ getChatHeader: vi.fn(async () => ({ agentId: 'ab', title: 'Chat A', children: [], csrfToken: 'csrf' })), renameChat: vi.fn() }));
vi.mock('../components/hyper/Transcript', () => ({ Transcript: () => <div>Conversation</div> }));
vi.mock('../components/hyper/CrabMascot', () => ({ CrabMascot: () => null }));
const select = vi.fn();
function setup() {
  vi.mocked(useHyper).mockReturnValue({ selected: 'ab', agents: [], events: [], page: null, loading: false, error: '', liveError: '', select, refresh: vi.fn(), hasOlder: false, loadingOlder: false, loadOlder: vi.fn(), outline: [], loadThrough: vi.fn() });
  vi.mocked(useCanvas).mockReturnValue({ view: null, open: false, activeItemId: null, rev: '', loading: false, error: null, setOpen: vi.fn(), refresh: vi.fn() });
  vi.mocked(useNavigation).mockReturnValue({ actProject:vi.fn().mockResolvedValue(true),pendingProjects:{},act:vi.fn().mockResolvedValue(true),pendingChats:{},actionError:'', projects: [{ id: 'ui', title: 'UI', dir: '/ui', host: null, chats: [{ id: 'ab', title: 'Chat A', model: '', runState: 'idle', hasUnread: false, lastReplyAt: null }] }], user: { name: 'Test', role: 'owner' }, canManage: true, error: '', profileError: '', loading: false, refresh: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ mode: 'home', tabs: [], widgets: [], groups: [], activeTab: null }), { headers: { 'Content-Type': 'application/json' } })));
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });
it('collapses to a persistent rail instead of unmounting navigation', () => {
  setup(); const view = render(<LiveApp />);
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть навбар' }));
  expect(localStorage.getItem('hyper.ui.sidebar.compact')).toBe('true');
  expect(document.querySelector('.desktop-sidebar')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  view.unmount(); render(<LiveApp />);
  expect(screen.getByRole('button', { name: 'Развернуть навбар' })).toBeVisible();
});
it.each(['metaKey', 'ctrlKey'])('focuses the navigation filter with %s + / without opening global search', key => {
  setup(); render(<LiveApp />);
  // Canvas performs its own initial JSON read; shortcuts must not add requests.
  vi.mocked(fetch).mockClear();
  const input = screen.getByRole('textbox', { name: 'Найти агента или проект' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Chat' } });
  fireEvent.keyDown(document, { key: '/', [key]: true });
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Chat');
  expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(4);
  fireEvent.keyDown(input, { key: '/', [key]: true });
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('expands the compact navigation and focuses its filter, including non-English keyboard layouts', () => {
  setup(); localStorage.setItem('hyper.ui.sidebar.compact', 'true'); render(<LiveApp />);
  expect(screen.queryByRole('textbox', { name: 'Найти агента или проект' })).toBeNull();
  fireEvent.keyDown(document, { key: '.', code: 'Slash', metaKey: true });
  expect(screen.getByRole('textbox', { name: 'Найти агента или проект' })).toHaveFocus();
  expect(localStorage.getItem('hyper.ui.sidebar.compact')).toBe('false');
});
it('opens mobile navigation and focuses the filter; repeated shortcut keeps it open', async () => {
  setup();
  const matchMedia = window.matchMedia;
  const media = matchMedia('');
  vi.stubGlobal('matchMedia', vi.fn(query => ({ ...media, media: query, matches: query === '(max-width: 1000px)' })));
  render(<LiveApp />);
  fireEvent.keyDown(document, { key: '/', metaKey: true });
  const dialog = await screen.findByRole('dialog', { name: 'Рабочее пространство' });
  const input = dialog.querySelector('input')!;
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.keyDown(input, { key: '/', ctrlKey: true });
  expect(input).toHaveFocus(); expect(dialog).toBeVisible();
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('starts a generic draft in the last visited project without changing the remembered model', () => {
  setup();
  localStorage.setItem('hyper-ui-last-session-selection', JSON.stringify({ projectId: 'other', model: 'provider:last' }));
  const nav = useNavigation();
  vi.mocked(useNavigation).mockReturnValue({ ...nav, projects: [{ id: 'other', title: 'Other', dir: '/other', host: null, chats: [] }, ...nav.projects] });
  render(<LiveApp />);
  fireEvent.click(screen.getByRole('button', { name: 'New Session' }));
  expect(select).toHaveBeenCalledWith('');
  expect(JSON.parse(sessionStorage.getItem('hyper-ui-new-session')!)).toMatchObject({ projectId: 'ui', model: 'provider:last' });
});
it('direct archived URL is read-only even before sidebar data has arrived', async () => {
  setup();
  const state = useHyper();
  vi.mocked(useHyper).mockReturnValue({...state,page:{agentId:'ab',archived:true,events:[],olderBefore:null,hasOlder:false,isRunning:false,runState:'idle',lastError:null,partial:null}});
  const navigation = useNavigation(); vi.mocked(useNavigation).mockReturnValue({...navigation,projects:[]});
  render(<LiveApp />);
  expect(screen.getByText('Архив · только чтение')).toBeVisible();
  expect(screen.getByRole('textbox',{name:'Сообщение агенту'})).toHaveAttribute('contenteditable','false');
  expect(screen.getByRole('textbox',{name:'Сообщение агенту'})).toHaveAttribute('aria-disabled','true');
  expect(screen.getByRole('button',{name:'Открыть Canvas'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Чат на всю ширину панели'})).toBeDisabled();
  expect(document.querySelector('.chat-readonly-boundary')).toHaveAttribute('inert');
});

