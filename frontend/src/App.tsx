import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, Columns2, Menu, Moon, PanelLeft, Plus, Sun, X } from 'lucide-react';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { Sheet } from './components/layout/Sheet';
import { SplitPane } from './components/layout/SplitPane';
import { Button } from './components/ui/Button';
import { IconButton } from './components/ui/IconButton';
import { AgentListItem } from './components/hyper/AgentListItem';
import { Composer } from './components/hyper/Composer';

const initialAgents = [
  { id: 'design', title: 'Новый интерфейс Hyper', preview: 'Компоненты и компоновка' },
  { id: 'research', title: 'Исследование', preview: 'Референсы и идеи' },
  { id: 'notes', title: 'Рабочие заметки', preview: 'Всё важное под рукой' },
];

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');
  const [chatWidth, setChatWidth] = useState(390);
  const [agents, setAgents] = useState(initialAgents);
  const [selected, setSelected] = useState('design');
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const current = agents.find(item => item.id === selected)!;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const addAgent = () => {
    const id = crypto.randomUUID();
    setAgents(items => [...items, { id, title: 'Новый агент', preview: 'Начните разговор' }]);
    setSelected(id); setSheetOpen(false); setMobileView('chat');
  };
  const sidebar = <Sidebar
    header={<><span className="brand"><span className="brand-mark">h</span>Hyper<span className="prototype-label">UI LAB</span></span><IconButton label="Новый агент" onClick={addAgent}><Plus size={18} /></IconButton></>}
    footer={<><span className="workspace-badge">H</span><div className="workspace-name"><strong>Личное пространство</strong><span>Локальный прототип</span></div><IconButton label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</IconButton></>}
  ><div className="section-label">Агенты <span>{agents.length}</span></div>{agents.map(item => <AgentListItem key={item.id} {...item} selected={selected === item.id} onSelect={() => { setSelected(item.id); setSheetOpen(false); setMobileView('chat'); }} />)}<div className="sidebar-note">Место для ваших идей,<br />инструментов и исследований.</div></Sidebar>;
  const canvas = <section className="canvas-panel" aria-label="Canvas">
    <Toolbar title="Canvas" subtitle="Рабочая область" actions={<IconButton label="Закрыть Canvas" onClick={() => { setCanvasOpen(false); setMobileView('chat'); }}><X size={16} /></IconButton>} />
    <div className="canvas-scroll"><div className="document">
      <div className="document-eyebrow">HYPER / DESIGN SYSTEM</div><h1>Меньше интерфейса.<br />Больше пространства.</h1>
      <p className="document-lead">Рабочее место, которое не отвлекает. Чат, материалы и инструменты — рядом, когда нужны.</p>
      <div className="document-divider" /><h3>Начинаем с основ</h3>
      <p>Одна система компонентов для большого экрана и телефона. Спокойная типографика, понятная иерархия и внимание к деталям.</p>
      <div className="principles">{[['01', 'Пространство', 'Панели меняют размер и уступают место содержимому.'], ['02', 'Последовательность', 'Общие цвета, размеры и состояния для всех компонентов.'], ['03', 'Отзывчивость', 'Клавиатура, мышь и касания — равноправные способы работы.']].map(([number, title, text]) => <div className="principle" key={number}><span>{number}</span><div><h4>{title}</h4><p>{text}</p></div><Check size={15} /></div>)}</div>
      <div className="document-footer"><span className="status-pill">Первая итерация</span><span>React · Base UI · Vite</span></div>
    </div></div>
  </section>;
  const chat = <section className="chat-panel" aria-label="Чат">
    <Toolbar title={current.title} subtitle="Тестовый диалог" leading={<IconButton className="desktop-only" label={sidebarVisible ? 'Скрыть список агентов' : 'Показать список агентов'} onClick={() => setSidebarVisible(!sidebarVisible)}><PanelLeft size={17} /></IconButton>} actions={<IconButton label={canvasOpen ? 'Скрыть Canvas' : 'Открыть Canvas'} aria-pressed={canvasOpen} onClick={() => { setCanvasOpen(!canvasOpen); setMobileView('canvas'); }}><Columns2 size={17} /></IconButton>} />
    <div className="chat-scroll" role="log" aria-label="Сообщения">
      <div className="chat-date">Демонстрация интерфейса</div>
      <div className="message message--user"><p>Давай создадим новый интерфейс Hyper. Компактный, спокойный и удобный на телефоне.</p></div>
      <div className="message message--assistant"><div className="message-author"><span className="assistant-mark">h</span>Hyper</div><p>Начнём с рабочего пространства. Список агентов слева, материалы в Canvas, разговор — рядом.</p><p>Все элементы собраны из общих компонентов. Можно менять тему, скрывать панели и регулировать ширину чата.</p><details className="tool-card"><summary><Check size={14} /><span>Подготовлена основа layout</span><ChevronRight size={14} /></summary><p>AppShell · Sidebar · Toolbar · SplitPane · Sheet</p></details></div>
      {(messages[selected] ?? []).map((text, index) => <div className="message message--user" key={index}><p>{text}</p></div>)}
    </div>
    <div className="chat-bottom"><Composer key={selected} onSend={text => setMessages(items => ({ ...items, [selected]: [...(items[selected] ?? []), text] }))} /><div className="chat-disclaimer">Сообщения остаются только в памяти этой страницы.</div></div>
  </section>;
  return <>
    <AppShell sidebar={sidebar} sidebarVisible={sidebarVisible} mobileHeader={<><IconButton label="Открыть навигацию" onClick={() => setSheetOpen(true)}><Menu size={20} /></IconButton><strong>Hyper</strong><div className="mobile-tabs"><Button variant={mobileView === 'chat' ? 'secondary' : 'ghost'} aria-pressed={mobileView === 'chat'} onClick={() => setMobileView('chat')}>Чат</Button><Button variant={mobileView === 'canvas' ? 'secondary' : 'ghost'} aria-pressed={mobileView === 'canvas'} onClick={() => { setCanvasOpen(true); setMobileView('canvas'); }}>Canvas <ArrowUpRight size={13} /></Button></div></>}>
      <div className={`workspace-layout view-${mobileView} ${canvasOpen ? 'has-canvas' : 'no-canvas'}`}>{canvasOpen ? <SplitPane primary={canvas} secondary={chat} secondaryWidth={chatWidth} onWidthChange={setChatWidth} /> : chat}</div>
    </AppShell>
    <Sheet title="Рабочее пространство" open={sheetOpen} onOpenChange={setSheetOpen}>{sidebar}</Sheet>
  </>;
}
