// Browser-only fixture: real React surfaces, no runtime/DB or application shell.
import { createRoot } from 'react-dom/client';
import { ApplicationPages } from '../../frontend/src/components/mauzcode/ApplicationPages';
import { CanvasPanel } from '../../frontend/src/components/mauzcode/CanvasPanel';
import { PeoplePage } from '../../frontend/src/components/PeoplePage';
window.mauzcodeLive = { subscribe: () => () => {} };
const surface = new URLSearchParams(location.search).get('surface');
createRoot(document.getElementById('root')!).render(surface === 'people' ? <PeoplePage /> : surface === 'canvas' ?
  <CanvasPanel agentId="fixture" revision={null} theme="light" onClose={() => {}} expanded={false} onExpand={() => {}} /> : <ApplicationPages theme="dark" />);
