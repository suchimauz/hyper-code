import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LiveApp } from './LiveApp';
import './styles/live.css';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/scrollbar.css';
import './styles/chat-viewport.css';
import './styles/message-input.css';

// iOS Safari ignores user-scalable=no, so block pinch zoom explicitly.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

// Mobile keyboard: size the app to the visible viewport and keep the page pinned,
// so the composer stays right above the keyboard without manual scrolling.
const viewport = window.visualViewport;
if (viewport) {
  const sync = () => {
    document.documentElement.style.setProperty('--app-height', `${Math.round(viewport.height)}px`);
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  };
  viewport.addEventListener('resize', sync); viewport.addEventListener('scroll', sync); sync();
}

createRoot(document.getElementById('root')!).render(<StrictMode>{new URL(location.href).searchParams.has('demo') ? <App /> : <LiveApp />}</StrictMode>);
