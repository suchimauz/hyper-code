import type { Preview } from '@storybook/react-vite';
import '../src/styles/tokens.css';
import '../src/styles/ui.css';
import '../src/styles/scrollbar.css';
import '../src/styles/chat-viewport.css';
import '../src/styles/message-input.css';
const preview: Preview = {
  globalTypes: {
    theme: { description: 'Цветовая тема', toolbar: { icon: 'circlehollow', items: ['light', 'dark', 'system'], dynamicTitle: true } },
  },
  initialGlobals: { theme: 'light' },
  decorators: [(Story, context) => <div data-theme={context.globals.theme} className="story-surface"><Story /></div>],
  parameters: { layout: 'fullscreen', controls: { expanded: true } },
};
export default preview;
