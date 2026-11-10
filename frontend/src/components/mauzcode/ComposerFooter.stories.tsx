import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveComposer } from './LiveComposer';
import { CrabMascot } from './CrabMascot';
const meta = { title: 'MauzCode/Composer footer', component: LiveComposer, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof LiveComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Preview: Story = {
  args: { agentId: 'storybook', running: false, onAccepted: () => {}, mascot: <CrabMascot page={null} /> },
  render: args => <div style={{ padding: '160px 32px 32px', maxWidth: 800, margin: 'auto' }}><LiveComposer {...args} /></div>,
};
