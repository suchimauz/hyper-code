import { expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NavigationChatIcon } from '../components/hyper/NavigationChatIcon';
const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><path d="M0 0"/></svg>');
it('renders custom SVG only as an inert image and preserves active status', () => {
  const { container } = render(<NavigationChatIcon icon={{ src, custom: true }} active />);
  expect(container.querySelector('img')).toHaveAttribute('src', src);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('.navigation-chat-icon')).toHaveClass('is-running');
});
it('renders native provider marks as theme-aware masks, rejects arbitrary image URLs', () => {
  const view = render(<NavigationChatIcon icon={{ src, custom: false }} />);
  expect(view.container.querySelector('.navigation-provider-icon')).toHaveStyle({ maskImage: `url("${src}")` });
  expect(view.container.querySelector('img')).toBeNull();
  view.rerender(<NavigationChatIcon icon={{ src: 'https://other.test/icon.svg', custom: true }} />);
  expect(view.container.querySelector('img')).toBeNull(); expect(view.container.querySelector('svg')).not.toBeNull();
});
it('removes the running indicator when work finishes without replacing the icon', () => {
  const view = render(<NavigationChatIcon icon={{ src, custom: true }} active />);
  const image = view.container.querySelector('img');
  expect(view.container.querySelector('.navigation-chat-icon')).toHaveClass('is-running');
  view.rerender(<NavigationChatIcon icon={{ src, custom: true }} active={false} />);
  expect(view.container.querySelector('.navigation-chat-icon')).not.toHaveClass('is-running');
  expect(view.container.querySelector('img')).toBe(image);
});
